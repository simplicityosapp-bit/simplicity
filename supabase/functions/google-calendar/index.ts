// ════════════════════════════════════════════════════════════════
//  google-calendar — one-way Google Calendar → Simplicity sync.
// ════════════════════════════════════════════════════════════════
//  Runs on Deno (Supabase Edge Functions). All OAuth token handling is
//  server-side: the tokens live in `user_integrations` (service-role
//  only — the browser can never read them). The browser only ever sees
//  non-secret status + the synced rows in `calendar_events`.
//
//  Deploy:  supabase functions deploy google-calendar
//  Secrets: supabase secrets set GOOGLE_CLIENT_ID=...  GOOGLE_CLIENT_SECRET=...
//  (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
//   injected automatically.)
//
//  Actions (POST { action, ... }):
//    auth-url   { redirect_uri }                  → { url }
//    connect    { code, redirect_uri, sync_from } → { status }
//    sync       { }                               → { status, synced, removed }
//    status     { }                               → { status }
//    disconnect { }                               → { ok }
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2'
import Fuse from 'npm:fuse.js@7'

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const MATCH_THRESHOLD = 0.7 // confidence (1 − fuse score) at/above which we auto-assign a client

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/* Service-role client — bypasses RLS, used for every DB op here. */
const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

/* Identify the caller from their JWT (anon client + their Authorization). */
async function getUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return null
  const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await supa.auth.getUser()
  return user?.id ?? null
}

// ── Google OAuth ────────────────────────────────────────────────
async function exchangeCode(code: string, redirectUri: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`token exchange failed: ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>
}

async function refreshAccess(refreshToken: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`token refresh failed: ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; expires_in: number }>
}

/* Return a valid access token, refreshing (and persisting) if it expired. */
async function freshAccessToken(integration: any): Promise<string> {
  const expiry = integration.token_expiry ? new Date(integration.token_expiry).getTime() : 0
  if (expiry - Date.now() > 60_000 && integration.access_token) return integration.access_token
  if (!integration.refresh_token) throw new Error('no refresh token — reconnect needed')
  const t = await refreshAccess(integration.refresh_token)
  const newExpiry = new Date(Date.now() + t.expires_in * 1000).toISOString()
  await admin.from('user_integrations')
    .update({ access_token: t.access_token, token_expiry: newExpiry })
    .eq('id', integration.id)
  return t.access_token
}

// ── Calendar fetch (full + incremental) ─────────────────────────
type GEvent = {
  id: string; status?: string; summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
}

/* Page through events. Full sync uses timeMin (past + future, recurring
   expanded); incremental uses the stored syncToken (which also reports
   cancellations). On a 410 the syncToken is stale → caller does a full
   resync. Returns the events + the next syncToken. */
async function fetchEvents(accessToken: string, opts: { timeMin?: string; syncToken?: string }) {
  const events: GEvent[] = []
  let pageToken: string | undefined
  let nextSyncToken: string | undefined
  do {
    const p = new URLSearchParams({ singleEvents: 'true', maxResults: '250' })
    if (opts.syncToken) p.set('syncToken', opts.syncToken)
    else { p.set('timeMin', opts.timeMin!); p.set('orderBy', 'startTime') }
    if (pageToken) p.set('pageToken', pageToken)
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${p}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (res.status === 410) { const e: any = new Error('sync token expired'); e.gone = true; throw e }
    if (!res.ok) throw new Error(`events.list failed: ${await res.text()}`)
    const data = await res.json()
    events.push(...(data.items ?? []))
    pageToken = data.nextPageToken
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken
  } while (pageToken)
  return { events, nextSyncToken }
}

// ── Fuzzy matching (clients, projects, … extensible) ────────────
/* Generic title→entity matcher. Returns the best entity id + confidence
   (1 − fuse score), or null below the threshold. The same factory is used
   for clients and projects today; add more targets the same way. */
function makeMatcher(items: { id: string; name: string }[]) {
  const fuse = new Fuse(items, { keys: ['name'], includeScore: true, threshold: 0.6, ignoreLocation: true })
  return (title: string): { id: string | null; confidence: number } => {
    const q = (title ?? '').trim()
    if (!q) return { id: null, confidence: 0 }
    const hit = fuse.search(q)[0]
    if (!hit) return { id: null, confidence: 0 }
    const confidence = 1 - (hit.score ?? 1) // fuse: 0 = perfect → confidence 1
    return confidence >= MATCH_THRESHOLD ? { id: hit.item.id, confidence } : { id: null, confidence }
  }
}

function eventTimes(e: GEvent) {
  const allDay = !!(e.start?.date && !e.start?.dateTime)
  const start = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00` : null)
  const end = e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00` : null)
  const startISO = start ? new Date(start).toISOString() : null
  const endISO = end ? new Date(end).toISOString() : null
  const duration = startISO && endISO ? Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 60000) : null
  return { allDay, startISO, endISO, duration }
}

const statusOf = (i: any) =>
  i ? { connected: !!i.refresh_token, sync_from: i.sync_from, last_synced_at: i.last_synced_at } : { connected: false }

// ── Core sync ───────────────────────────────────────────────────
async function runSync(userId: string) {
  const { data: integration } = await admin.from('user_integrations')
    .select('*').eq('user_id', userId).eq('provider', 'google_calendar').maybeSingle()
  if (!integration?.refresh_token) throw new Error('not connected')

  const accessToken = await freshAccessToken(integration)

  // Match against this user's live clients AND projects.
  const { data: clients } = await admin.from('clients')
    .select('id, name').eq('user_id', userId).is('deleted_at', null)
  const { data: projects } = await admin.from('projects')
    .select('id, name').eq('user_id', userId).is('deleted_at', null)
  const matchClient = makeMatcher((clients ?? []) as any)
  const matchProject = makeMatcher((projects ?? []) as any)

  // Pull events — incremental if we have a token, else full from sync_from.
  let events: GEvent[] = []
  let nextSyncToken: string | undefined
  try {
    const timeMin = new Date(`${integration.sync_from}T00:00:00Z`).toISOString()
    const r = await fetchEvents(accessToken, integration.sync_token
      ? { syncToken: integration.sync_token }
      : { timeMin })
    events = r.events; nextSyncToken = r.nextSyncToken
  } catch (e: any) {
    if (!e.gone) throw e
    const timeMin = new Date(`${integration.sync_from}T00:00:00Z`).toISOString()
    const r = await fetchEvents(accessToken, { timeMin }) // token stale → full resync
    events = r.events; nextSyncToken = r.nextSyncToken
  }

  // Preserve manual matches: never overwrite a client/project the user set
  // by hand. matched_manually freezes BOTH links for that event.
  const ids = events.map((e) => e.id)
  const manual = new Map<string, { client_id: string | null; project_id: string | null }>()
  if (ids.length) {
    const { data: existing } = await admin.from('calendar_events')
      .select('google_event_id, client_id, project_id, matched_manually')
      .eq('user_id', userId).in('google_event_id', ids)
    ;(existing ?? []).forEach((r: any) => {
      if (r.matched_manually) manual.set(r.google_event_id, { client_id: r.client_id, project_id: r.project_id })
    })
  }

  const upserts: any[] = []
  const cancelled: string[] = []
  for (const e of events) {
    if (e.status === 'cancelled') { cancelled.push(e.id); continue }
    const { allDay, startISO, endISO, duration } = eventTimes(e)
    const isManual = manual.has(e.id)
    let clientId: string | null
    let projectId: string | null
    let confidence: number
    if (isManual) {
      const m = manual.get(e.id)!
      clientId = m.client_id; projectId = m.project_id; confidence = 1
    } else {
      const c = matchClient(e.summary ?? '')
      const p = matchProject(e.summary ?? '')
      clientId = c.id; projectId = p.id; confidence = c.confidence
    }
    /* ALL events are stored — matched or not (unmatched just carry null
       links). The unique (user_id, google_event_id) key dedupes, so an
       event is never inserted twice. */
    upserts.push({
      user_id: userId,
      google_event_id: e.id,
      client_id: clientId,
      project_id: projectId,
      title: e.summary ?? '(ללא כותרת)',
      start_time: startISO,
      end_time: endISO,
      all_day: allDay,
      duration_minutes: duration,
      confidence_score: confidence,
      matched_manually: isManual,
      deleted_at: null,
    })
  }

  if (upserts.length) {
    const { error } = await admin.from('calendar_events')
      .upsert(upserts, { onConflict: 'user_id,google_event_id' })
    if (error) throw error
  }
  if (cancelled.length) {
    await admin.from('calendar_events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', userId).in('google_event_id', cancelled)
  }

  const last_synced_at = new Date().toISOString()
  await admin.from('user_integrations')
    .update({ last_synced_at, sync_token: nextSyncToken ?? integration.sync_token })
    .eq('id', integration.id)

  return { synced: upserts.length, removed: cancelled.length, last_synced_at, sync_from: integration.sync_from }
}

// ── HTTP entry ──────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const userId = await getUserId(req)
    if (!userId) return json({ error: 'unauthorized' }, 401)
    const { action, code, redirect_uri, sync_from } = await req.json().catch(() => ({}))

    if (action === 'auth-url') {
      if (!redirect_uri) return json({ error: 'redirect_uri required' }, 400)
      const p = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri,
        response_type: 'code',
        scope: SCOPE,
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state: userId,
      })
      return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${p}` })
    }

    if (action === 'connect') {
      if (!code || !redirect_uri) return json({ error: 'code + redirect_uri required' }, 400)
      const tok = await exchangeCode(code, redirect_uri)
      if (!tok.refresh_token) return json({ error: 'no refresh_token — remove the app at myaccount.google.com/permissions and reconnect' }, 400)
      const token_expiry = new Date(Date.now() + tok.expires_in * 1000).toISOString()
      await admin.from('user_integrations').upsert({
        user_id: userId,
        provider: 'google_calendar',
        access_token: tok.access_token,
        refresh_token: tok.refresh_token,
        token_expiry,
        sync_from: sync_from ?? new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10),
        sync_token: null,
        last_synced_at: null,
      }, { onConflict: 'user_id,provider' })
      const result = await runSync(userId)
      return json({ status: { connected: true, sync_from: result.sync_from, last_synced_at: result.last_synced_at }, ...result })
    }

    if (action === 'sync') {
      const result = await runSync(userId)
      return json({ status: { connected: true, sync_from: result.sync_from, last_synced_at: result.last_synced_at }, ...result })
    }

    if (action === 'status') {
      const { data } = await admin.from('user_integrations')
        .select('refresh_token, sync_from, last_synced_at')
        .eq('user_id', userId).eq('provider', 'google_calendar').maybeSingle()
      return json({ status: statusOf(data) })
    }

    if (action === 'disconnect') {
      const { data } = await admin.from('user_integrations')
        .select('refresh_token').eq('user_id', userId).eq('provider', 'google_calendar').maybeSingle()
      if (data?.refresh_token) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${data.refresh_token}`, { method: 'POST' }).catch(() => {})
      }
      await admin.from('user_integrations').delete().eq('user_id', userId).eq('provider', 'google_calendar')
      return json({ ok: true, status: { connected: false } })
    }

    return json({ error: 'unknown action' }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
