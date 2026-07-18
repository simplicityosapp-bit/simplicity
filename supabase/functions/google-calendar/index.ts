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

// calendar.events grants read (events.list — the one-way sync) AND write
// (creating/deleting the booking events below). It REPLACES the old
// calendar.readonly: existing connections keep their readonly grant and keep
// SYNCING fine, but WRITES return 403 until the coach reconnects once (the
// push/unpush paths surface that as reason:'reconnect_needed', never a crash).
const SCOPE = 'https://www.googleapis.com/auth/calendar.events'

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

// ── Booking → Google Calendar write (Phase 6) ───────────────────
/* Load the user's google_calendar integration row (tokens), or null. */
async function getIntegration(userId: string) {
  const { data } = await admin.from('user_integrations')
    .select('*').eq('user_id', userId).eq('provider', 'google_calendar').maybeSingle()
  return data
}

/* Create a Google Calendar event for a CONFIRMED booking and remember its id.
   All-or-nothing best-effort: returns a structured { written, reason } and
   NEVER throws to the caller, so confirming a booking never fails because of
   Google. The owner controls this per page (booking_pages.write_to_google /
   invite_client) — the flags are read here server-side, never trusted from
   the client. Idempotent: a booking that already has a google_event_id is a
   no-op. */
async function pushBooking(userId: string, bookingId: string) {
  const { data: booking } = await admin.from('bookings')
    .select('*').eq('id', bookingId).eq('user_id', userId).maybeSingle()
  if (!booking) return { written: false, reason: 'not_found' }
  if (booking.status !== 'confirmed') return { written: false, reason: 'not_confirmed' }
  if (booking.google_event_id) return { written: true, reason: 'already', google_event_id: booking.google_event_id }
  if (!booking.page_id) return { written: false, reason: 'no_page' }

  // Authoritative per-page opt-in (never trust the browser).
  const { data: page } = await admin.from('booking_pages')
    .select('write_to_google, invite_client').eq('id', booking.page_id).maybeSingle()
  if (!page?.write_to_google) return { written: false, reason: 'disabled' }

  const integration = await getIntegration(userId)
  if (!integration?.refresh_token) return { written: false, reason: 'not_connected' }

  // Meeting-type name → goes into the title only. meeting_types carries no
  // structured physical/online flag or address, so there is no real location.
  let typeName = ''
  if (booking.meeting_type_id) {
    const { data: mt } = await admin.from('meeting_types').select('name').eq('id', booking.meeting_type_id).maybeSingle()
    typeName = mt?.name ?? ''
  }
  const title = typeName ? `${booking.name} — ${typeName}` : (booking.name || 'פגישה')
  const descParts: string[] = []
  if (booking.note) descParts.push(booking.note)
  descParts.push('נקבע דרך דף קביעת פגישות')

  // A single Google event shows ONE description to every attendee, so we keep
  // the body to title + note + source only — the visitor's phone/email are
  // deliberately NOT written to the event (the coach has them in the CRM).
  const event: Record<string, unknown> = {
    summary: title,
    description: descParts.join('\n\n'),
    start: { dateTime: new Date(booking.starts_at).toISOString() },
    end: { dateTime: new Date(booking.ends_at).toISOString() },
  }
  const invite = !!(page.invite_client && booking.email)
  if (invite) event.attendees = [{ email: booking.email, displayName: booking.name || undefined }]

  let accessToken: string
  try { accessToken = await freshAccessToken(integration) }
  catch { return { written: false, reason: 'reconnect_needed' } }

  const p = new URLSearchParams()
  if (invite) p.set('sendUpdates', 'all')
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${p}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  })
  // 403 = the granted token still only has the old readonly scope → reconnect.
  if (res.status === 401 || res.status === 403) return { written: false, reason: 'reconnect_needed' }
  if (!res.ok) { console.error('push-booking events.insert failed:', res.status, await res.text()); return { written: false, reason: 'google_error' } }
  const created = await res.json()
  const gid = created.id as string
  if (!gid) return { written: false, reason: 'google_error' }

  // Remember the real id on the booking, and RETAG the owned calendar_event
  // (it held the sentinel 'booking:<id>') with the real id. The read-sync skips
  // owned events, so the next sync recognises this event and never duplicates
  // it. (user_id, google_event_id) is unique and gid is brand-new → no clash.
  await admin.from('bookings').update({ google_event_id: gid }).eq('id', bookingId)
  if (booking.event_id) {
    await admin.from('calendar_events').update({ google_event_id: gid })
      .eq('id', booking.event_id).eq('user_id', userId)
  }
  return { written: true, google_event_id: gid }
}

/* Delete the Google event for a booking (on cancel). Best-effort + idempotent:
   a 404/410 (already gone) is treated as success, and our pointer is cleared
   regardless. The local owned calendar_event is removed by the browser (RLS)
   in the cancel flow — here we only touch Google + the booking pointer. */
async function unpushBooking(userId: string, bookingId: string) {
  const { data: booking } = await admin.from('bookings')
    .select('id, google_event_id').eq('id', bookingId).eq('user_id', userId).maybeSingle()
  if (!booking) return { ok: false, reason: 'not_found' }
  if (!booking.google_event_id) return { ok: true, reason: 'nothing_to_delete' }

  const integration = await getIntegration(userId)
  if (integration?.refresh_token) {
    try {
      const accessToken = await freshAccessToken(integration)
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(booking.google_event_id)}?sendUpdates=all`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (!res.ok && res.status !== 404 && res.status !== 410) {
        console.error('unpush-booking events.delete failed:', res.status, await res.text())
      }
    } catch (e) { console.error('unpush-booking error:', e) }
  }
  await admin.from('bookings').update({ google_event_id: null }).eq('id', bookingId)
  return { ok: true }
}

/* Push the caller's added community events (0092) into their Google Calendar.
   Each gets a DETERMINISTIC id 'cmt<uuid-hex>' so a repeat click is idempotent
   (Google answers 409 for a duplicate id, which we count as "already there").
   On success we retag the in-app calendar_events row (it held the sentinel
   'community:<id>') to the real id + owned=true — exactly the push-booking
   trick, so the read-sync recognises the event and never duplicates it. The
   client sends the event fields; we never trust it for identity beyond the id. */
async function pushCommunity(userId: string, events: any): Promise<Record<string, unknown>> {
  const list = Array.isArray(events) ? events : []
  const integration = await getIntegration(userId)
  if (!integration?.refresh_token) return { ok: false, reason: 'not_connected' }
  let accessToken: string
  try { accessToken = await freshAccessToken(integration) }
  catch { return { ok: false, reason: 'reconnect_needed' } }

  let added = 0, existing = 0, failed = 0
  for (const ev of list) {
    if (!ev?.id || !ev?.starts_at) { failed++; continue }
    // 'cmt' + 32 hex chars — all within Google's base32hex id alphabet (a-v,0-9).
    const gid = 'cmt' + String(ev.id).replace(/-/g, '').toLowerCase()
    const start = new Date(ev.starts_at)
    const end = ev.ends_at ? new Date(ev.ends_at) : new Date(start.getTime() + 3600000)
    const descParts: string[] = []
    if (ev.description) descParts.push(String(ev.description))
    if (ev.link) descParts.push(String(ev.link))
    descParts.push('אירוע קהילה — סימפליסיטי')
    const body: Record<string, unknown> = {
      id: gid,
      summary: ev.title ? String(ev.title) : 'אירוע קהילה',
      description: descParts.join('\n\n'),
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    }
    if (ev.location) body.location = String(ev.location)

    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'reconnect_needed', added, existing }
    let retag = false
    if (res.status === 409) { existing++; retag = true }              // already in Google → idempotent
    else if (res.ok) { added++; retag = true }
    else { console.error('push-community insert failed:', res.status, await res.text()); failed++ }

    if (retag) {
      const { error: upErr } = await admin.from('calendar_events')
        .update({ google_event_id: gid, owned: true })
        .eq('user_id', userId).eq('google_event_id', `community:${ev.id}`)
      /* If a cmt<hex> row already exists for this event (a re-import, or the
         pull-sync re-created it), the rename hits the (user_id, google_event_id)
         unique constraint. The community:<id> row is then redundant — drop it so
         the calendar never shows the event twice. */
      if (upErr) {
        await admin.from('calendar_events').delete()
          .eq('user_id', userId).eq('google_event_id', `community:${ev.id}`)
      }
    }
  }
  return { ok: true, added, existing, failed }
}

// ── HTTP entry ──────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const userId = await getUserId(req)
    if (!userId) return json({ error: 'unauthorized' }, 401)
    const { action, code, redirect_uri, sync_from, state, bookingId, events } = await req.json().catch(() => ({}))

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
        // CSRF: echo back the client-generated random nonce so the browser can
        // verify on return that THIS device started the flow (the connect code
        // is only redeemed if the returned state matches the stored nonce).
        // Fall back to userId for older clients that don't send a state.
        state: (typeof state === 'string' && state) ? state : userId,
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

    if (action === 'push-booking') {
      if (!bookingId) return json({ error: 'bookingId required' }, 400)
      return json(await pushBooking(userId, bookingId))
    }

    if (action === 'unpush-booking') {
      if (!bookingId) return json({ error: 'bookingId required' }, 400)
      return json(await unpushBooking(userId, bookingId))
    }

    if (action === 'push-community') {
      return json(await pushCommunity(userId, events))
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
