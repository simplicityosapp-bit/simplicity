/* ════════════════════════════════════════════════════════════════
   HOME DATA — derived values for the home widgets.
   ════════════════════════════════════════════════════════════════
   Each function accepts an optional `data` bag with named members
   (transactions, clients, tasks, leads, sessions, scheduled_meetings,
   goals, categories, reminders). Missing members default to [] — no mock
   fallback (every caller passes real data from hooks).
   ════════════════════════════════════════════════════════════════ */

import i18n from '@simplicity/core/i18n'
import { ROUTES } from './routes'
import { financeQuery, currentMonthRange, clientBalance, effectiveClientMeta, getClientMemberships } from '@simplicity/core'

const DAY = 86400000
const live = (a) => (a || []).filter((r) => !r.deleted_at)
const ils = (n) => {
  const locale = i18n.language === 'he' ? 'he-IL' : (i18n.language || 'he-IL')
  return `${Math.round(Math.abs(n)).toLocaleString(locale)} ₪`
}

/* ── Money ─────────────────────────────────────────────────────── */
export function monthNet(now = new Date(), data) {
  const { transactions } = data || {}
  const tx = financeQuery({ ...currentMonthRange(now), source: transactions })
  const inc = tx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const exp = tx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  return { inc, exp, net: inc - exp }
}
function monthlyIncomeGoal(data) {
  const { goals = [], categories = [] } = data || {}
  const cat = categories.find((c) => c.measurement_type === 'auto' && c.data_source === 'transactions')
  if (!cat) return 0
  const g = live(goals).find((x) => x.category_id === cat.id && x.time_frame === 'monthly')
  return g ? g.target_value : 0
}

/* ── 45-day rules ──────────────────────────────────────────────── */
function lastClientSession(cid, sessions) {
  const ts = live(sessions).filter((s) => s.client_id === cid).map((s) => new Date(s.date).getTime())
  return ts.length ? Math.max(...ts) : null
}
/* Status MUST come from effectiveClientMeta, never the raw `status` column:
   the canonical value lives in status_meta, `status` is a legacy mirror that
   the client drawer never rewrote (so it goes stale on every manual change),
   and group members derive their status from the group entirely. Reading the
   raw column surfaced 'past' clients as needing attention. */
export function clientsNeedingAttention(days = 45, now = new Date(), data) {
  const { clients = [], sessions = [], members = [], groups = [] } = data || {}
  const cutoff = now.getTime() - days * DAY
  return live(clients).filter((c) => {
    if (!['active', 'wandering'].includes(effectiveClientMeta(c, members, groups))) return false
    if (c.created_at && new Date(c.created_at).getTime() > cutoff) return false /* too new to nag */
    /* "התעלם" restarts the same 45-day clock rather than muting forever, so a
       dismissed client resurfaces if the gap keeps growing. */
    if (c.attention_snoozed_at && new Date(c.attention_snoozed_at).getTime() >= cutoff) return false
    const last = lastClientSession(c.id, sessions)
    return last === null || last < cutoff
  })
}
export function leadsNeedingAttention(days = 45, now = new Date(), leads = []) {
  const cutoff = now.getTime() - days * DAY
  return live(leads).filter(
    (l) => l.status_meta === 'in_process' && l.last_status_changed_at && new Date(l.last_status_changed_at).getTime() < cutoff,
  )
}

/* ── Chips ─────────────────────────────────────────────────────── */
/* Per-tile filter shapes — saved under userPreferences.tileFilters.
   Each field is optional; a missing field means "no filter on that
   axis" (the engine treats it as the widest reasonable default). */
const DEFAULT_TILE_FILTERS = {
  clients: { statuses: ['active', 'wandering'], projectIds: [], groupIds: [] },
  net:     { timeRange: 'thisMonth', type: 'both', projectIds: [], groupIds: [], categoryIds: [] },
  today:   { kinds: ['meeting', 'calendar', 'followup', 'reminder'] },
}

export function getTileFilters(prefs) {
  const fromPrefs = prefs?.tileFilters || {}
  return {
    clients: { ...DEFAULT_TILE_FILTERS.clients, ...(fromPrefs.clients || {}) },
    net:     { ...DEFAULT_TILE_FILTERS.net,     ...(fromPrefs.net     || {}) },
    today:   { ...DEFAULT_TILE_FILTERS.today,   ...(fromPrefs.today   || {}) },
  }
}

/* Is this client in one of the selected groups?
   Membership is a `group_members` row. `clients.group_id` is a LEGACY mirror
   written only by the client form + lead conversion — anyone assigned through
   the group roster (assignToGroup) never gets one — so matching that column
   alone silently dropped most of a group's members from the filter. Both are
   checked so neither write path is missed. */
export function clientInGroups(c, groupIds, membersData = []) {
  if (!groupIds?.length) return true
  if (c.group_id && groupIds.includes(c.group_id)) return true
  return getClientMemberships(c.id, membersData).some((m) => groupIds.includes(m.group_id))
}

/* ── Today's agenda (home "פגישות היום" chip + drill panel) ─────────
   Merge the day's scheduled meetings, synced Google events, and lead
   follow-ups into ONE time-sorted list. `filter.kinds` controls which
   sources are included — it drives both the chip number and the panel
   list. Pure + no mock fallback: a cold load reads empty, never
   fabricated rows. Returns normalized items: { id, kind, when, title,
   phone?, subjectType?, subjectId?, leadId?, allDay?, meeting? }. */
const TODAY_KINDS = ['meeting', 'calendar', 'followup', 'reminder']
export function todayItems(now = new Date(), data = {}, filter = {}) {
  const { meetings = [], calendarEvents = [], leads = [], clients = [], groups = [], reminders = [] } = data
  const kinds = filter.kinds && filter.kinds.length ? filter.kinds : TODAY_KINDS
  const pad = (n) => String(n).padStart(2, '0')
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const sameDay = (val) => {
    if (!val) return false
    const dt = new Date(val)
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}` === todayKey
  }
  const out = []

  if (kinds.includes('meeting')) {
    live(meetings)
      .filter((mt) => mt.status !== 'skipped' && sameDay(mt.scheduled_at))
      .forEach((mt) => {
        const isGroup = mt.subject_type === 'group'
        const subject = isGroup
          ? (groups || []).find((g) => g.id === mt.subject_id)
          : (clients || []).find((c) => c.id === mt.subject_id)
        out.push({
          id: `mtg-${mt.id}`, kind: 'meeting', when: mt.scheduled_at,
          title: subject?.name || '', phone: isGroup ? '' : (subject?.phone || ''),
          subjectType: mt.subject_type, subjectId: mt.subject_id, status: mt.status, meeting: mt,
        })
      })
  }

  if (kinds.includes('calendar')) {
    ;(calendarEvents || [])
      .filter((ev) => !ev.deleted_at && sameDay(ev.start_time))
      .forEach((ev) => out.push({
        id: `cal-${ev.id}`, kind: 'calendar', when: ev.start_time,
        title: ev.title || ev.summary || '', allDay: !!ev.all_day,
      }))
  }

  if (kinds.includes('followup')) {
    live(leads)
      .filter((l) => l.status_meta === 'in_process' && l.follow_up_date && String(l.follow_up_date).slice(0, 10) === todayKey)
      .forEach((l) => out.push({
        /* follow-ups carry no time — pin to 09:00, matching the calendar feed. */
        id: `fu-${l.id}`, kind: 'followup', when: `${todayKey}T09:00:00`,
        title: l.name || '', phone: l.phone || '', leadId: l.id,
      }))
  }

  if (kinds.includes('reminder')) {
    /* Today's reminders — the same recurring/one-off expansion the calendar
       feed uses (remindersUpcoming), narrowed to today (daysAhead 0, no cap).
       Reminders show on the calendar too, so this keeps the לו"ז faithful to
       it; toggled per the today.kinds filter like every other kind. */
    remindersUpcoming(now, reminders, 0, 0).forEach((r) => out.push({
      id: `rem-${r.id}`, kind: 'reminder', when: r.when, title: r.title || '',
    }))
  }

  return out.sort((a, b) => new Date(a.when) - new Date(b.when))
}

function rangeFromKey(key, now) {
  if (key === 'thisWeek') {
    const start = new Date(now)
    const dow = start.getDay()
    start.setDate(start.getDate() - dow)
    start.setHours(0, 0, 0, 0)
    return { from: start, to: now }
  }
  if (key === 'last30days') {
    const start = new Date(now.getTime() - 30 * DAY)
    return { from: start, to: now }
  }
  /* default = thisMonth */
  return currentMonthRange(now)
}

/* Filter-aware computation of the home tiles that show a number.
   Each tile reads its slice from the resolved filters; missing
   filters fall back to sensible defaults (see DEFAULT_TILE_FILTERS). */
export function homeChips(now = new Date(), data, filters = DEFAULT_TILE_FILTERS) {
  const { clients = [], transactions, members = [], groups = [] } = data || {}
  const f = {
    clients: { ...DEFAULT_TILE_FILTERS.clients, ...(filters.clients || {}) },
    net:     { ...DEFAULT_TILE_FILTERS.net,     ...(filters.net     || {}) },
  }

  /* Clients tile — count by EFFECTIVE status + optional project/group.
     Status MUST come from effectiveClientMeta, never the raw `status_meta` /
     `status` columns: a client whose status is driven by their group carries a
     stale own-status, so reading it directly made this chip disagree with the
     clients screen (and with the attention widget, which was already fixed).
     Same rule as clientsNeedingAttention above. */
  const activeClients = live(clients).filter((c) => {
    const meta = effectiveClientMeta(c, members, groups)
    if (f.clients.statuses?.length && !f.clients.statuses.includes(meta)) return false
    if (f.clients.projectIds?.length && !f.clients.projectIds.includes(c.project_id)) return false
    if (!clientInGroups(c, f.clients.groupIds, members)) return false
    return true
  }).length

  /* Net tile — type, time range, project/category. Only confirmed
     transactions feed the number; financeQuery already drops
     pending/skipped via isConfirmedTx. */
  const range = rangeFromKey(f.net.timeRange, now)
  const filteredTx = financeQuery({ ...range, source: transactions }).filter((t) => {
    if (f.net.projectIds?.length && !f.net.projectIds.includes(t.project_id)) return false
    if (f.net.categoryIds?.length && !f.net.categoryIds.includes(t.category_id)) return false
    return true
  })
  let inc = 0, exp = 0
  for (const t of filteredTx) {
    if (t.type === 'income') inc += t.amount
    else if (t.type === 'expense') exp += t.amount
  }
  let net
  if (f.net.type === 'income') net = inc
  else if (f.net.type === 'expense') net = -exp
  else net = inc - exp

  return { activeClients, net, _income: inc, _expense: exp, _txCount: filteredTx.length }
}

/* ── Attention rows ────────────────────────────────────────────── */
export function attentionItems(now = new Date(), data) {
  const {
    transactions = [],
    scheduled_meetings = [],
    clients = [],
    tasks = [],
    goals = [],
    categories = [],
    sessions = [],
    leads = [],
    members = [],
    groups = [],
  } = data || {}
  /* Every row carries a stable `rowId` — one per rule, unique within a run.
     It is the widget's React key (the key used to be `icon + text`, which
     collides the moment two rules share an icon AND render the same string,
     and churns on every language switch or count change). The people rows
     additionally use it to re-resolve themselves while their modal is open. */
  /* Row labels are localized at compute time via the active i18n language.
     The widget re-runs this memo on language change so the rows re-render. */
  const T = (key, opts) => i18n.t(`home:widgets.attention.rows.${key}`, opts)
  const items = []
  const pending = (transactions || []).filter((t) => !t.deleted_at && t.status === 'pending')
  if (pending.length) items.push({ rowId: 'pendingTx', icon: 'Wallet', text: T('pendingTx', { count: pending.length }), to: ROUTES.FINANCE, kind: 'pendingTx' })

  const pastMeetings = (scheduled_meetings || []).filter(
    (m) => m.status === 'pending' && new Date(m.scheduled_at).getTime() <= now.getTime(),
  )
  if (pastMeetings.length) {
    items.push({ rowId: 'pendingMeetings', icon: 'Calendar', text: T('pendingMeetings', { count: pastMeetings.length }), to: ROUTES.CALENDAR, kind: 'pendingMeetings' })
  }

  const withBalance = live(clients).filter((c) => effectiveClientMeta(c, members, groups) !== 'past' && clientBalance(c, transactions, sessions, members, groups).balance > 0)
  if (withBalance.length) items.push({ rowId: 'balance', icon: 'Wallet', text: T('balance', { count: withBalance.length }), to: ROUTES.CLIENTS })

  const goal = monthlyIncomeGoal({ goals, categories })
  const { inc } = monthNet(now, { transactions })
  if (goal > 0 && inc < goal) {
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate()
    items.push({ rowId: 'goalGap', icon: 'Target', text: T('goalGap', { amount: ils(goal - inc), days: daysLeft, count: daysLeft }), to: ROUTES.GOALS })
  }

  const urgent = live(tasks).filter((t) => t.status !== 'done' && t.priority === 'high').length
  if (urgent) items.push({ rowId: 'urgentTasks', icon: 'AlertCircle', text: T('urgentTasks', { count: urgent }), to: ROUTES.TASKS })

  const staleClients = clientsNeedingAttention(45, now, { clients, sessions, members, groups })
  if (staleClients.length) items.push({ icon: 'Clock', text: T('staleClients', { count: staleClients.length }), to: ROUTES.CLIENTS, kind: 'people', rowId: 'staleClients', entity: 'client', waKey: 'client', people: staleClients.map((c) => ({ id: c.id, name: c.name, phone: c.phone || '' })) })

  /* Leads from public lead-pages awaiting manual approval. Kept orthogonal:
     pending leads are excluded from the stale / follow-up rules below. */
  const officialLeads = live(leads).filter((l) => !l.pending_review)
  const pendingLeads = live(leads).filter((l) => l.pending_review)
  if (pendingLeads.length) items.push({ rowId: 'pendingLeads', icon: 'Bell', text: T('pendingLeads', { count: pendingLeads.length }), to: ROUTES.LEADS, kind: 'pendingLeads' })

  const staleLeads = leadsNeedingAttention(45, now, officialLeads)
  if (staleLeads.length) items.push({ icon: 'Clock', text: T('staleLeads', { count: staleLeads.length }), to: ROUTES.LEADS, kind: 'people', rowId: 'staleLeads', entity: 'lead', waKey: 'lead', people: staleLeads.map((l) => ({ id: l.id, name: l.name, phone: l.phone || '' })) })

  /* Lead follow-ups due — date ≤ today AND still in_process (closed metas
     suppress, the follow-up is moot). follow_up_date is a 'YYYY-MM-DD' string
     so a lexical compare against today's local YYYY-MM-DD is correct. */
  const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const dueFollowups = officialLeads.filter(
    (l) => l.status_meta === 'in_process' && l.follow_up_date && String(l.follow_up_date).slice(0, 10) <= todayYmd,
  )
  if (dueFollowups.length) items.push({ icon: 'Bell', text: T('dueFollowups', { count: dueFollowups.length }), to: ROUTES.LEADS, kind: 'people', rowId: 'dueFollowups', entity: 'lead', waKey: 'lead', people: dueFollowups.map((l) => ({ id: l.id, name: l.name, phone: l.phone || '' })) })

  return items
}

/* Semantic target keys → web routes. Web's attentionItems() emits `to` (a
   ROUTES path) directly; the shared core attentionItems() emits a semantic
   `target` key instead (mobile maps it to its own navigator). This covers the
   second shape so an item of either form resolves to a real route. */
const TARGET_ROUTE = {
  finance: ROUTES.FINANCE,
  calendar: ROUTES.CALENDAR,
  clients: ROUTES.CLIENTS,
  goals: ROUTES.GOALS,
  tasks: ROUTES.TASKS,
  leads: ROUTES.LEADS,
}

/* The single source of truth for what clicking an attention row does, so the
   widget handler and the item shape can't silently drift apart. That drift is
   exactly what broke the widget once: a refactor pointed the handler at
   `it.target` while every web item still carried `it.to`, turning all four
   navigating rows (balances, goal-gap, urgent tasks, pending leads) into dead
   clicks. Centralising the decision here — and testing it against the real
   attentionItems() output — closes that gap.

   Returns one of:
     { type: 'popup',   popup: 'tx' | 'meetings' }  — open the approve modal
     { type: 'people' }                             — open the reach-out list
     { type: 'navigate', to: <route> }              — go to a screen
     null                                            — genuinely not actionable */
export function attentionRowAction(it) {
  if (!it) return null
  if (it.kind === 'pendingTx') return { type: 'popup', popup: 'tx' }
  if (it.kind === 'pendingMeetings') return { type: 'popup', popup: 'meetings' }
  if (it.kind === 'people') return { type: 'people' }
  const to = it.to || (it.target ? TARGET_ROUTE[it.target] : null)
  return to ? { type: 'navigate', to } : null
}

/* ── Upcoming reminders (window: today → +60d) ─────────────────── */
function nextWeeklyOccurrence(r, start) {
  const base = new Date(r.scheduled_at)
  const target = r.recurrence_pattern?.dayOfWeek
  if (typeof target !== 'number') return null
  const d = new Date(Math.max(base.getTime(), start.getTime()))
  d.setHours(base.getHours(), base.getMinutes(), 0, 0)
  for (let i = 0; i < 7; i++) {
    if (d.getDay() === target) return new Date(d)
    d.setDate(d.getDate() + 1)
  }
  return null
}
function nextMonthlyDateOccurrence(r, start) {
  const base = new Date(r.scheduled_at)
  const target = r.recurrence_pattern?.dayOfMonth
  if (typeof target !== 'number') return null
  /* Try this month + 2 forward; pick the first ≥ start. */
  for (let m = 0; m < 3; m++) {
    const y = start.getFullYear()
    const mm = start.getMonth() + m
    const daysInMonth = new Date(y, mm + 1, 0).getDate()
    const day = Math.min(target, daysInMonth)
    const d = new Date(y, mm, day, base.getHours(), base.getMinutes(), 0, 0)
    if (d >= start) return d
  }
  return null
}
function nextEveryXDaysOccurrence(r, start) {
  const base = new Date(r.scheduled_at)
  const x = r.recurrence_pattern?.x
  if (!x || x <= 0) return null
  if (base >= start) return base
  const diffDays = Math.ceil((start.getTime() - base.getTime()) / DAY)
  const steps = Math.ceil(diffDays / x)
  const d = new Date(base)
  d.setDate(d.getDate() + steps * x)
  return d
}
function nextReminderOccurrence(r, start) {
  if (r.recurrence_type === 'weekly') return nextWeeklyOccurrence(r, start)
  if (r.recurrence_type === 'monthly_date') return nextMonthlyDateOccurrence(r, start)
  if (r.recurrence_type === 'every_x_days') return nextEveryXDaysOccurrence(r, start)
  return new Date(r.scheduled_at)
}
/* Surface the next occurrence of each pending/triggered reminder in
   the lookahead window. Default window matches the home widget (60
   days / top 5) so existing callers don't change behaviour; the
   calendar passes wider params to cover its grid views.

   ⚠️ The window deliberately STARTS AT TODAY. Past-dated reminders are never
   surfaced — including on the calendar grid, where past MEETINGS *do* show.
   That asymmetry is an OWNER DECISION (2026-07-19): reminders are action items,
   not history, so the calendar doesn't backfill them. This is intended
   behaviour, not a bug — please don't "fix" it. */
export function remindersUpcoming(now = new Date(), remindersData = [], daysAhead = 60, limit = 5) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead, 23, 59, 59)
  const out = []
  live(remindersData).forEach((r) => {
    if (!['pending', 'triggered'].includes(r.status)) return
    if (r.end_date && new Date(r.end_date) < start) return
    const occ = nextReminderOccurrence(r, start)
    if (occ && occ >= start && occ <= end) out.push({ id: r.id, title: r.title, when: occ, linked_to_type: r.linked_to_type, linked_to_id: r.linked_to_id })
  })
  out.sort((a, b) => a.when - b.when)
  return limit ? out.slice(0, limit) : out
}

/* ── Next tasks (open, by priority) ────────────────────────────── */
const PORDER = { high: 0, medium: 1, low: 2 }
export function nextTasks(limit = 5, tasks = []) {
  return live(tasks)
    .filter((t) => t.status !== 'done')
    .slice()
    .sort((a, b) => (PORDER[a.priority] ?? 1) - (PORDER[b.priority] ?? 1))
    .slice(0, limit)
}
export function openTasksCount(tasks = []) {
  return live(tasks).filter((t) => t.status !== 'done').length
}
