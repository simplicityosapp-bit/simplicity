// ════════════════════════════════════════════════════════════════
//  booking-intake — PUBLIC endpoint for Booking Pages (/book/<id>).
// ════════════════════════════════════════════════════════════════
//  The single public surface for appointment-booking pages. The public
//  page NEVER touches the DB directly — it talks only to this function,
//  which holds the service role:
//
//    • GET  ?page=<id>                  → published page PUBLIC config
//      (content + offered meeting types + trimmed availability). 404 if
//      missing / unpublished / deleted. `title`, `auto_confirm` and the
//      raw weekly hours beyond what's needed are not relied upon as secret
//      (a booking page's hours are inherently public), but internal fields
//      are not echoed.
//    • GET  ?page=<id>&action=slots&type=<mt>&from=YYYY-MM-DD&to=YYYY-MM-DD
//      → { slots:[{start,end}], timezone }. Open slots = the page's weekly
//      windows MINUS everything already busy for the coach:
//        scheduled_meetings + calendar_events + active bookings.
//      (Google-Calendar events are already mirrored into calendar_events by
//      the google-calendar sync, so a connected coach's Google busy-times
//      are covered without this function holding any Google token.)
//    • POST {page, meetingTypeId, start, answers} → validate, then insert a
//      booking for the PAGE'S user_id (never client-supplied). Lands as
//      'pending' unless the page opted into auto_confirm. A DB EXCLUDE
//      constraint rejects the double-booking race atomically → 409.
//
//  PUBLIC — deploy with:
//      supabase functions deploy booking-intake --no-verify-jwt
//
//  Trust model mirrors lead-intake: user_id comes ONLY from the page row;
//  required validation + caps are server-authoritative; per-IP rate limit +
//  honeypot blunt spam.
//
//  NOTE: this function only INSERTS the booking row (which already holds the
//  slot via the EXCLUDE constraint + the availability read). Turning a
//  confirmed booking into a lead + calendar_event + Google event happens in
//  the app's confirm flow — kept out of the public surface on purpose.
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

const str = (v: unknown) => (v == null ? '' : String(v)).trim()
const MAX_ANSWER_LEN = 2000
const DEFAULT_DURATION = 50

// ── Rate limiting (best-effort, per warm isolate; mirrors lead-intake) ──────
const RL = new Map<string, number[]>()
function overLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const arr = (RL.get(key) ?? []).filter((t) => now - t < windowMs)
  arr.push(now)
  RL.set(key, arr)
  if (RL.size > 10_000) RL.clear()
  return arr.length > max
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function loadPublishedPage(idOrSlug: string) {
  if (!idOrSlug) return null
  let q = admin.from('booking_pages').select('*').eq('published', true).is('deleted_at', null)
  q = UUID_RE.test(idOrSlug) ? q.eq('id', idOrSlug) : q.eq('slug', idOrSlug.toLowerCase())
  const { data, error } = await q.maybeSingle()
  if (error) { console.error('booking-intake load error:', error); return null }
  return data
}

/* Resolve the page's offered meeting types (ordered by meeting_type_ids).
   Falls back to one synthetic "פגישה" type using the page default duration
   when the page declares none. */
async function resolveMeetingTypes(page: any) {
  const ids = Array.isArray(page.meeting_type_ids) ? page.meeting_type_ids.filter(Boolean) : []
  const defDur = Number(page.availability?.defaultDurationMinutes) || DEFAULT_DURATION
  if (!ids.length) {
    return [{ id: null, name: 'פגישה', duration_minutes: defDur, default_price: null, color: null }]
  }
  const { data } = await admin
    .from('meeting_types')
    .select('id,name,duration_minutes,default_price,color')
    .eq('user_id', page.user_id)
    .is('deleted_at', null)
    .in('id', ids)
  // Per-PAGE duration overrides (migration 0059). A page's stored length for a
  // type wins over the type's own default, so editing duration on one page
  // never affects another page that offers the same type.
  const overrides = (page.meeting_type_durations && typeof page.meeting_type_durations === 'object')
    ? page.meeting_type_durations : {}
  const byId = new Map((data ?? []).map((m: any) => [m.id, m]))
  const resolved = ids
    .map((id: string) => byId.get(id))
    .filter(Boolean)
    .map((m: any) => {
      const override = Number(overrides[m.id])
      const dur = override > 0
        ? override
        : (Number(m.duration_minutes) > 0 ? Number(m.duration_minutes) : defDur)
      return {
        id: m.id,
        name: m.name,
        duration_minutes: dur,
        default_price: m.default_price ?? null,
        color: m.color ?? null,
      }
    })
  // All selected types were deleted → fall back to a generic slot so the page
  // still works rather than offering nothing.
  if (!resolved.length) {
    return [{ id: null, name: 'פגישה', duration_minutes: defDur, default_price: null, color: null }]
  }
  return resolved
}

/* Strip a page row down to what the public page may see. */
function publicConfig(page: any, types: any[]) {
  const a = page.availability ?? {}
  const weekly = a.weekly ?? {}
  const weekdays = Object.keys(weekly)
    .filter((d) => Array.isArray(weekly[d]) && weekly[d].length > 0)
    .map((d) => Number(d))
  return {
    id: page.id,
    content: page.content ?? {},
    meetingTypes: types,
    requirePayment: !!page.require_payment, // chosen type's default_price is the amount
    availability: {
      timezone: a.timezone || 'Asia/Jerusalem',
      slotMinutes: Number(a.slotMinutes) || 30,
      minNoticeHours: Number(a.minNoticeHours) || 0,
      maxDaysAhead: Number(a.maxDaysAhead) || 30,
      weekdays,
    },
  }
}

// ── Timezone math: local wall time in an IANA zone → UTC instant ────────────
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const m: Record<string, string> = {}
  for (const p of dtf.formatToParts(date)) m[p.type] = p.value
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second)
  return asUTC - date.getTime()
}
function zonedWallToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  let utc = guess - tzOffsetMs(new Date(guess), tz)
  const off2 = tzOffsetMs(new Date(utc), tz)
  const utc2 = guess - off2
  if (utc2 !== utc) utc = utc2 // refine across a DST boundary
  return new Date(utc)
}

const hm = (s: string) => {
  const [h, m] = String(s || '').split(':').map((n) => parseInt(n, 10))
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}
const overlaps = (s1: number, e1: number, s2: number, e2: number) => s1 < e2 && e1 > s2

/* Local weekday (0=Sun..6=Sat) + minutes-since-midnight for an instant in a
   zone. h23 forces 00–23 (en-US h12:false can emit '24' at midnight). */
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
function localDowMin(ms: number, tz: string): { dow: number; min: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', weekday: 'short', hour: '2-digit', minute: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const x of dtf.formatToParts(new Date(ms))) p[x.type] = x.value
  return { dow: WD[p.weekday] ?? 0, min: (+p.hour) * 60 + (+p.minute) }
}
/* True when [start, start+duration) fits inside one of the day's windows. */
function withinWindow(startMs: number, duration: number, tz: string, weekly: any): boolean {
  const { dow, min } = localDowMin(startMs, tz)
  const windows = Array.isArray(weekly?.[dow]) ? weekly[dow]
    : (Array.isArray(weekly?.[String(dow)]) ? weekly[String(dow)] : [])
  return windows.some((w: any) => { const ws = hm(w.start), we = hm(w.end); return min >= ws && min + duration <= we })
}

/* Iterate calendar dates [from, to] inclusive as {y,mo,d}. */
function* eachDate(from: string, to: string) {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  let cur = Date.UTC(fy, fm - 1, fd)
  const end = Date.UTC(ty, tm - 1, td)
  let guard = 0
  while (cur <= end && guard < 400) {
    const dt = new Date(cur)
    yield { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate(), wd: dt.getUTCDay() }
    cur += 86_400_000
    guard += 1
  }
}

/* Collect busy intervals (ms epoch pairs) for a coach in [rangeStart,rangeEnd]. */
async function busyIntervals(userId: string, rangeStartIso: string, rangeEndIso: string, defDur: number) {
  const busy: Array<[number, number]> = []

  const { data: bk } = await admin
    .from('bookings')
    .select('starts_at,ends_at,status')
    .eq('user_id', userId)
    .in('status', ['pending', 'confirmed'])
    .lt('starts_at', rangeEndIso)
    .gte('ends_at', rangeStartIso)
  for (const r of bk ?? []) busy.push([+new Date(r.starts_at), +new Date(r.ends_at)])

  const { data: ev } = await admin
    .from('calendar_events')
    .select('start_time,end_time,all_day')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .lt('start_time', rangeEndIso)
    .gte('end_time', rangeStartIso)
  for (const r of ev ?? []) {
    if (!r.start_time) continue
    const s = +new Date(r.start_time)
    const e = r.end_time ? +new Date(r.end_time) : s + (r.all_day ? 86_400_000 : defDur * 60_000)
    busy.push([s, e])
  }

  const { data: sm } = await admin
    .from('scheduled_meetings')
    .select('scheduled_at')
    .eq('user_id', userId)
    .gte('scheduled_at', rangeStartIso)
    .lt('scheduled_at', rangeEndIso)
  for (const r of sm ?? []) {
    const s = +new Date(r.scheduled_at)
    busy.push([s, s + defDur * 60_000])
  }

  return busy
}

// ── Grow pay-at-booking (Phase 3) ───────────────────────────────────────────
const GROW_BASE: Record<string, string> = {
  sandbox: 'https://sandbox.meshulam.co.il/api/light/server/1.0',
  production: 'https://secure.meshulam.co.il/api/light/server/1.0',
}
const PAYMENT_HOLD_MIN = 20 // minutes a slot is held awaiting payment

/* Lazily release expired awaiting-payment holds for a coach so the slot frees.
   The bookings_no_overlap EXCLUDE covers ALL pending rows, so an expired hold
   must be cancelled before a new booking can take the slot. No cron — runs on
   every slots-read / booking POST. */
async function releaseExpiredHolds(userId: string) {
  try {
    await admin.from('bookings')
      .update({ status: 'cancelled' })
      .eq('user_id', userId).eq('status', 'pending').eq('payment_status', 'awaiting')
      .lt('payment_deadline', new Date().toISOString())
  } catch (e) { console.error('booking-intake releaseExpiredHolds', e) }
}

/* The coach's Grow connection (service-role; never exposed to the page). */
async function loadGrow(userId: string) {
  const { data } = await admin.from('user_integrations')
    .select('*').eq('user_id', userId).eq('provider', 'grow').maybeSingle()
  return data
}

/* Create a Grow hosted-payment link for a booking. Inlined (booking-intake
   can't import the grow function's gateway). ⚠️ UNVERIFIED — mirrors
   grow/gateway.ts createPaymentLink; calibrate against a live account. Returns
   { url, processId, processToken } or null on any failure. */
async function createGrowLink(integ: any, o: {
  amount: number; description: string; name: string; phone?: string | null; email?: string | null;
  notifyUrl: string; successUrl: string; cancelUrl: string; correlationId: string;
}) {
  const env = integ.environment === 'sandbox' ? 'sandbox' : 'production'
  const form = new FormData()
  form.append('pageCode', integ.page_code ?? '')
  form.append('userId', integ.api_key ?? '')          // column api_key = Grow userId
  if (integ.api_secret) form.append('apiKey', integ.api_secret)
  form.append('sum', String(o.amount))
  form.append('description', o.description || 'תשלום עבור פגישה')
  form.append('pageField[fullName]', o.name || 'לקוח')
  if (o.phone) form.append('pageField[phone]', o.phone)
  if (o.email) form.append('pageField[email]', o.email)
  form.append('successUrl', o.successUrl)
  form.append('cancelUrl', o.cancelUrl)
  form.append('notifyUrl', o.notifyUrl)
  form.append('cField1', o.correlationId)
  let res: Response
  try { res = await fetch(`${GROW_BASE[env]}/createPaymentProcess`, { method: 'POST', body: form }) }
  catch (e) { console.error('booking grow link unreachable', e); return null }
  if (!res.ok) { console.error('booking grow link http', res.status); return null }
  const data = (await res.json().catch(() => ({}))) as any
  const d = data?.data ?? {}
  const url = d.url ?? d.paymentUrl ?? (typeof data?.url === 'string' ? data.url : null)
  if (data?.status !== 1 || !url) { console.error('booking grow link failed'); return null }
  return { url: String(url), processId: d.processId != null ? String(d.processId) : null, processToken: d.processToken ?? d.token ?? null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'

  try {
    if (req.method === 'GET') {
      if (overLimit(`get:${ip}`, 240, 60_000)) return json({ error: 'rate_limited' }, 429)
      const url = new URL(req.url)
      const page = await loadPublishedPage(str(url.searchParams.get('page')))
      if (!page) return json({ error: 'not_found' }, 404)

      const types = await resolveMeetingTypes(page)
      const action = str(url.searchParams.get('action'))

      if (action !== 'slots') return json(publicConfig(page, types))

      // ── slots ──────────────────────────────────────────────────────
      const a = page.availability ?? {}
      const tz = a.timezone || 'Asia/Jerusalem'
      const slotMin = Number(a.slotMinutes) || 30
      const bufferMs = (Number(a.bufferMinutes) || 0) * 60_000
      const minNoticeMs = (Number(a.minNoticeHours) || 0) * 3_600_000
      const maxDays = Number(a.maxDaysAhead) || 30
      const defDur = Number(a.defaultDurationMinutes) || DEFAULT_DURATION
      const weekly = a.weekly ?? {}

      const typeId = str(url.searchParams.get('type'))
      const chosen = typeId ? types.find((t) => t.id === typeId) : types[0]
      const duration = (chosen?.duration_minutes && chosen.duration_minutes > 0)
        ? chosen.duration_minutes : defDur

      const now = Date.now()
      const earliest = now + minNoticeMs
      const horizon = now + maxDays * 86_400_000
      const from = str(url.searchParams.get('from'))
      const to = str(url.searchParams.get('to'))
      if (!from || !to) return json({ error: 'bad_range' }, 400)

      // Free any expired awaiting-payment holds first so their slots reappear.
      await releaseExpiredHolds(page.user_id)
      // Pull busy once for the whole queried range (+1 day margin).
      const rangeStartIso = new Date(now).toISOString()
      const rangeEndIso = new Date(horizon + 86_400_000).toISOString()
      const busy = await busyIntervals(page.user_id, rangeStartIso, rangeEndIso, defDur)

      const slots: Array<{ start: string; end: string }> = []
      for (const { y, mo, d, wd } of eachDate(from, to)) {
        const windows = Array.isArray(weekly[wd]) ? weekly[wd] : (Array.isArray(weekly[String(wd)]) ? weekly[String(wd)] : [])
        for (const w of windows) {
          const ws = hm(w.start), we = hm(w.end)
          for (let s = ws; s + duration <= we; s += slotMin) {
            const startDt = zonedWallToUtc(y, mo, d, Math.floor(s / 60), s % 60, tz)
            const startMs = +startDt
            const endMs = startMs + duration * 60_000
            if (startMs < earliest || startMs > horizon) continue
            let free = true
            for (const [bs, be] of busy) {
              if (overlaps(startMs, endMs, bs - bufferMs, be + bufferMs)) { free = false; break }
            }
            if (free) slots.push({ start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() })
          }
        }
      }
      return json({ slots, timezone: tz, durationMinutes: duration })
    }

    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

    // ── POST: accept a booking ─────────────────────────────────────────
    if (overLimit(`post:${ip}`, 20, 60_000)) return json({ error: 'rate_limited' }, 429)

    const body = await req.json().catch(() => ({}))
    const page = await loadPublishedPage(str(body?.page))
    if (!page) return json({ error: 'not_found' }, 404)
    // Free expired awaiting-payment holds so a lapsed slot can be re-booked.
    await releaseExpiredHolds(page.user_id)

    const answers = (body?.answers && typeof body.answers === 'object') ? body.answers : {}
    // Honeypot: silently pretend success.
    if (str(answers._hp)) return json({ ok: true, thankYou: page.content?.thankYou ?? null })

    const types = await resolveMeetingTypes(page)
    const a = page.availability ?? {}
    const defDur = Number(a.defaultDurationMinutes) || DEFAULT_DURATION
    const reqTypeId = str(body?.meetingTypeId)
    const chosen = reqTypeId ? types.find((t) => t.id === reqTypeId) : types[0]
    if (reqTypeId && !chosen) return json({ error: 'bad_type' }, 400)
    const duration = (chosen?.duration_minutes && chosen.duration_minutes > 0) ? chosen.duration_minutes : defDur

    const startMs = +new Date(str(body?.start))
    if (!Number.isFinite(startMs)) return json({ error: 'bad_start' }, 400)
    const minNoticeMs = (Number(a.minNoticeHours) || 0) * 3_600_000
    const maxDays = Number(a.maxDaysAhead) || 30
    if (startMs < Date.now() + minNoticeMs) return json({ error: 'too_soon' }, 400)
    if (startMs > Date.now() + maxDays * 86_400_000) return json({ error: 'too_far' }, 400)
    // Integrity: the chosen start must fall inside an availability window for
    // that weekday (the slot list already enforces this; re-check so a crafted
    // POST can't book outside the coach's hours).
    const tz = a.timezone || 'Asia/Jerusalem'
    if (!withinWindow(startMs, duration, tz, a.weekly ?? {})) return json({ error: 'outside_hours' }, 400)
    const endMs = startMs + duration * 60_000

    // Best-effort conflict check vs meetings/events (bookings-vs-bookings is
    // enforced atomically by the EXCLUDE constraint below).
    const bufferMs = (Number(a.bufferMinutes) || 0) * 60_000
    const busy = await busyIntervals(page.user_id,
      new Date(startMs - 86_400_000).toISOString(),
      new Date(endMs + 86_400_000).toISOString(), defDur)
    for (const [bs, be] of busy) {
      if (overlaps(startMs, endMs, bs - bufferMs, be + bufferMs)) return json({ error: 'slot_taken' }, 409)
    }

    const name = str(answers.name).slice(0, MAX_ANSWER_LEN)
    if (!name) return json({ error: 'missing_name' }, 400)

    const phoneVal = str(answers.phone).slice(0, MAX_ANSWER_LEN) || null
    const emailVal = str(answers.email).slice(0, MAX_ANSWER_LEN) || null

    // Online payment? The page must opt in AND the chosen type must have a price
    // AND the coach must have Grow connected. If Grow isn't connected (misconfig)
    // we fall back to a normal booking rather than blocking the visitor.
    const price = Number(chosen?.default_price)
    const grow = (page.require_payment && price > 0) ? await loadGrow(page.user_id) : null
    const needsPayment = !!grow && price > 0

    const row: Record<string, unknown> = {
      page_id: page.id,
      user_id: page.user_id,
      meeting_type_id: chosen?.id ?? null,
      name,
      phone: phoneVal,
      email: emailVal,
      note: str(answers.note).slice(0, MAX_ANSWER_LEN) || null,
      data: {},
      starts_at: new Date(startMs).toISOString(),
      ends_at: new Date(endMs).toISOString(),
      // Payment-required → hold as pending+awaiting (must pay first; ignore
      // auto_confirm). Otherwise the normal pending / auto-confirm behaviour.
      status: needsPayment ? 'pending' : (page.auto_confirm ? 'confirmed' : 'pending'),
      payment_status: needsPayment ? 'awaiting' : 'none',
      payment_deadline: needsPayment ? new Date(Date.now() + PAYMENT_HOLD_MIN * 60_000).toISOString() : null,
    }

    const { data: inserted, error } = await admin.from('bookings').insert(row).select('id').single()
    if (error) {
      // 23P01 = exclusion_violation → the slot was grabbed in the race.
      if ((error as any).code === '23P01') return json({ error: 'slot_taken' }, 409)
      console.error('booking-intake insert error:', error)
      return json({ error: 'insert_failed' }, 500)
    }

    // No payment required → done (existing behaviour).
    if (!needsPayment) return json({ ok: true, thankYou: page.content?.thankYou ?? null })

    // Payment required → mint a Grow link tied to this booking; the page
    // redirects the visitor to it. grow-webhook confirms payment + records income.
    let token = grow.webhook_token
    if (!token) {
      const { data: upd } = await admin.from('user_integrations').update({ webhook_token: crypto.randomUUID() }).eq('id', grow.id).select('webhook_token').maybeSingle()
      token = upd?.webhook_token
    }
    const desc = `${chosen?.name ?? 'פגישה'} — ${name}`.slice(0, 200)
    const { data: pr } = await admin.from('payment_requests').insert({
      user_id: page.user_id, booking_id: inserted.id, source: 'booking',
      amount: price, description: desc, status: 'pending',
    }).select('id').single()
    const origin = str(body?.origin)
    const base = /^https?:\/\//.test(origin) ? origin : 'https://simplicity-os.com'
    const slugOrId = page.slug || page.id
    const link = pr ? await createGrowLink(grow, {
      amount: price, description: desc, name, phone: phoneVal, email: emailVal,
      notifyUrl: `${SUPABASE_URL}/functions/v1/grow-webhook?t=${token}`,
      successUrl: `${base}/book/${slugOrId}?paid=1`,
      cancelUrl: `${base}/book/${slugOrId}?cancelled=1`,
      correlationId: pr.id,
    }) : null

    if (!link) {
      // Couldn't mint the link → don't hold a dead slot: cancel the booking and
      // tell the page (a paid page must not silently accept an unpaid booking).
      await admin.from('bookings').update({ status: 'cancelled', payment_status: 'none' }).eq('id', inserted.id)
      if (pr) await admin.from('payment_requests').update({ status: 'failed' }).eq('id', pr.id)
      return json({ error: 'payment_unavailable' }, 502)
    }
    await admin.from('payment_requests').update({
      payment_url: link.url, grow_process_id: link.processId, grow_process_token: link.processToken,
    }).eq('id', pr.id)
    return json({ ok: true, payment: { url: link.url } })
  } catch (e) {
    console.error('booking-intake error:', e)
    return json({ error: 'internal_error' }, 500)
  }
})
