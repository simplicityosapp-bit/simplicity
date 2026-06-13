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

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

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
async function fetchEvents(accessToken: string, opts: { timeMin?: string; timeMax?: string; syncToken?: string }) {
  const events: GEvent[] = []
  let pageToken: string | undefined
  let nextSyncToken: string | undefined
  do {
    const p = new URLSearchParams({ singleEvents: 'true', maxResults: '250' })
    if (opts.syncToken) p.set('syncToken', opts.syncToken)
    else {
      p.set('timeMin', opts.timeMin!)
      p.set('orderBy', 'startTime')
      if (opts.timeMax) p.set('timeMax', opts.timeMax)
    }
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

// ── Strict name matching (clients, projects, leads, groups … extensible) ─
/* Exact whole-word matcher. Fuzzy matching bled across names that share a
   root (e.g. "אורן" / "אורטל" were wrongly assigned to the client "אורלי"),
   so we now require the entity's FULL name to appear as exact words in the
   event title — precision over recall, per the "very high level only" steer.
   Niqqud is stripped and matching is case-insensitive. When several names
   qualify the longest (most specific) wins; no qualifying name ⇒ the event
   is left UNidentified (the user can still assign it by hand). */
const wordsOf = (s: string): string[] =>
  (s ?? '').toString().toLowerCase().normalize('NFKD')
    .replace(/[֑-ׇ]/g, '')        // strip Hebrew niqqud
    .split(/[^\p{L}\p{N}]+/u)               // split on anything that isn't a letter/digit
    .filter((w) => w.length >= 2)           // drop 1-char noise (prepositions etc.)

function makeMatcher(items: { id: string; name: string }[]) {
  const prepared = (items ?? [])
    .map((it) => ({ id: it.id, words: wordsOf(it.name) }))
    .filter((p) => p.words.length > 0)
  return (title: string): { id: string | null; confidence: number } => {
    const titleWords = new Set(wordsOf(title))
    if (!titleWords.size) return { id: null, confidence: 0 }
    let best: { id: string; len: number } | null = null
    for (const p of prepared) {
      if (!p.words.every((w) => titleWords.has(w))) continue           // every name word must be present, verbatim
      const len = p.words.reduce((n, w) => n + w.length, 0)
      if (!best || len > best.len) best = { id: p.id, len }            // longest name = most specific match
    }
    return best ? { id: best.id, confidence: 1 } : { id: null, confidence: 0 }
  }
}

function eventTimes(e: GEvent) {
  const allDay = !!(e.start?.date && !e.start?.dateTime)
  const start = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00` : null)
  const end = e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00` : null)
  const startISO = start ? new Date(start).toISOString() : null
  const endISO = end ? new Date(end).toISOString() : null
  /* All-day events: Google's end.date is EXCLUSIVE (the day after), so a
     naive end−start is always ~24h. Duration is meaningless for an all-day
     event → null. Only timed events get a real duration. */
  const duration = (!allDay && startISO && endISO)
    ? Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 60000)
    : null
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

  // Match against this user's live clients, projects, leads AND groups.
  const [{ data: clients }, { data: projects }, { data: leads }, { data: groups }] = await Promise.all([
    admin.from('clients').select('id, name').eq('user_id', userId).is('deleted_at', null),
    admin.from('projects').select('id, name').eq('user_id', userId).is('deleted_at', null),
    admin.from('leads').select('id, name').eq('user_id', userId).is('deleted_at', null),
    admin.from('groups').select('id, name').eq('user_id', userId).is('deleted_at', null),
  ])
  const matchClient = makeMatcher((clients ?? []) as any)
  const matchProject = makeMatcher((projects ?? []) as any)
  const matchLead = makeMatcher((leads ?? []) as any)
  const matchGroup = makeMatcher((groups ?? []) as any)

  // Pull events — incremental if we have a token, else full from sync_from.
  // Future is bounded (sync_from → +1y) so a full resync can't fetch an
  // unbounded window. `didFull` tracks whether we (re)ran a full sync so
  // we never write back a syncToken we just learned is stale (→ 410 loop).
  const timeMin = new Date(`${integration.sync_from}T00:00:00Z`).toISOString()
  const timeMax = new Date(Date.now() + 365 * 86400000).toISOString()
  let events: GEvent[] = []
  let nextSyncToken: string | undefined
  let didFull = !integration.sync_token
  try {
    const r = await fetchEvents(accessToken, integration.sync_token
      ? { syncToken: integration.sync_token }
      : { timeMin, timeMax })
    events = r.events; nextSyncToken = r.nextSyncToken
  } catch (e: any) {
    if (!e.gone) throw e
    didFull = true
    const r = await fetchEvents(accessToken, { timeMin, timeMax }) // token stale → full resync
    events = r.events; nextSyncToken = r.nextSyncToken
  }

  // Preserve manual matches: never overwrite a link the user set by hand.
  // matched_manually freezes ALL links (client/project/lead/group) for that event.
  const ids = events.map((e) => e.id)
  const manual = new Map<string, { client_id: string | null; project_id: string | null; lead_id: string | null; group_id: string | null }>()
  // Events the user has CLAIMED (owned=true) are detached from the sync:
  // we never touch them, so their edited title/time and their deletion
  // survive future syncs (migration 0023).
  const owned = new Set<string>()
  if (ids.length) {
    const { data: existing } = await admin.from('calendar_events')
      .select('google_event_id, client_id, project_id, lead_id, group_id, matched_manually, owned')
      .eq('user_id', userId).in('google_event_id', ids)
    ;(existing ?? []).forEach((r: any) => {
      if (r.owned) owned.add(r.google_event_id)
      if (r.matched_manually) manual.set(r.google_event_id, { client_id: r.client_id, project_id: r.project_id, lead_id: r.lead_id, group_id: r.group_id })
    })
  }

  const upserts: any[] = []
  const cancelled: string[] = []
  for (const e of events) {
    if (owned.has(e.id)) continue // claimed by the user — never overwrite or re-delete
    if (e.status === 'cancelled') { cancelled.push(e.id); continue }
    const { allDay, startISO, endISO, duration } = eventTimes(e)
    const isManual = manual.has(e.id)
    let clientId: string | null
    let projectId: string | null
    let leadId: string | null
    let groupId: string | null
    let confidence: number
    if (isManual) {
      const m = manual.get(e.id)!
      clientId = m.client_id; projectId = m.project_id; leadId = m.lead_id; groupId = m.group_id
      confidence = (clientId || projectId || leadId || groupId) ? 1 : 0 // a cleared manual match isn't "confident"
    } else {
      const c = matchClient(e.summary ?? '')
      const p = matchProject(e.summary ?? '')
      const l = matchLead(e.summary ?? '')
      const g = matchGroup(e.summary ?? '')
      clientId = c.id; projectId = p.id; leadId = l.id; groupId = g.id
      confidence = Math.max(c.confidence, p.confidence, l.confidence, g.confidence) // best of the assigned links
    }
    /* ALL events are stored — matched or not (unmatched just carry null
       links). The unique (user_id, google_event_id) key dedupes, so an
       event is never inserted twice. */
    upserts.push({
      user_id: userId,
      google_event_id: e.id,
      client_id: clientId,
      project_id: projectId,
      lead_id: leadId,
      group_id: groupId,
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
    .update({
      last_synced_at,
      /* After a full (re)sync, store the fresh token or NULL — never the old
         one (which would 410 again next time). Incremental keeps the prior
         token if Google didn't hand back a new one. */
      sync_token: didFull ? (nextSyncToken ?? null) : (nextSyncToken ?? integration.sync_token),
    })
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
        /* Revoke via POST body — never put the token in the URL (it leaks to
           proxy/access logs). Fire-and-forget; we delete our copy regardless. */
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: data.refresh_token }),
        }).catch(() => {})
      }
      await admin.from('user_integrations').delete().eq('user_id', userId).eq('provider', 'google_calendar')
      return json({ ok: true, status: { connected: false } })
    }

    return json({ error: 'unknown action' }, 400)
  } catch (e) {
    // Log full detail server-side; never echo it to the client — the thrown
    // messages embed raw Google token-endpoint / events.list response bodies.
    console.error('google-calendar error:', e)
    return json({ error: 'sync_failed' }, 500)
  }
})
