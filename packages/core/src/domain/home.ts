/* ════════════════════════════════════════════════════════════════
   HOME — pure derivations for the home screen (shared web + mobile).
   ════════════════════════════════════════════════════════════════
   Ported from apps/web's homeData.js view-model, minus the web-only
   parts (route URLs, icon-name strings, i18n label lookup) — those
   stay per-app. Everything here is pure data-in → numbers-out and
   reuses the core finance engine. Callers pass real rows; missing
   members default to [] (no mock fallback).

   NOTE: apps/web still has its own lib/homeData.js today; this core
   module is consumed by apps/mobile first. When web is later rewired
   to import from here, the temporary overlap resolves.
   ════════════════════════════════════════════════════════════════ */

import { financeQuery, currentMonthRange, type Tx } from './finance'

const DAY = 86400000
const live = <T extends { deleted_at?: string | null }>(a: T[] | null | undefined): T[] =>
  (a || []).filter((r) => !r.deleted_at)

export interface HomeClient {
  id?: string
  name?: string
  phone?: string
  deleted_at?: string | null
  status?: string
  status_meta?: string
  project_id?: string | null
  group_id?: string | null
}
export interface HomeMeeting {
  id: string
  deleted_at?: string | null
  status?: string
  subject_type?: string
  subject_id?: string
  scheduled_at: string | number | Date
}
export interface HomeCalEvent {
  id: string
  deleted_at?: string | null
  start_time?: string | number | Date | null
  title?: string
  summary?: string
  all_day?: boolean
}
export interface HomeLead {
  id: string
  deleted_at?: string | null
  status_meta?: string
  follow_up_date?: string | null
  name?: string
  phone?: string
}
export interface HomeGroup {
  id: string
  name?: string
}
export interface HomeTask {
  deleted_at?: string | null
  status?: string
  priority?: string
  project_id?: string | null
  client_id?: string | null
}

/* Per-tile filter shapes — saved under userPreferences.tileFilters. Each
   field is optional; a missing field means "no filter on that axis". */
export interface TileFilters {
  clients: { statuses?: string[]; projectIds?: string[]; groupIds?: string[] }
  net: { timeRange?: string; type?: string; projectIds?: string[]; groupIds?: string[]; categoryIds?: string[] }
  tasks: { status?: string; priorities?: string[]; projectIds?: string[]; clientScope?: string }
  today: { kinds?: string[] }
}

export const DEFAULT_TILE_FILTERS: TileFilters = {
  clients: { statuses: ['active', 'wandering'], projectIds: [], groupIds: [] },
  net: { timeRange: 'thisMonth', type: 'both', projectIds: [], groupIds: [], categoryIds: [] },
  tasks: { status: 'open', priorities: [], projectIds: [], clientScope: 'all' },
  today: { kinds: ['meeting', 'calendar', 'followup'] },
}

export function getTileFilters(prefs?: { tileFilters?: Partial<TileFilters> } | null): TileFilters {
  const fromPrefs = prefs?.tileFilters || {}
  return {
    clients: { ...DEFAULT_TILE_FILTERS.clients, ...(fromPrefs.clients || {}) },
    net: { ...DEFAULT_TILE_FILTERS.net, ...(fromPrefs.net || {}) },
    tasks: { ...DEFAULT_TILE_FILTERS.tasks, ...(fromPrefs.tasks || {}) },
    today: { ...DEFAULT_TILE_FILTERS.today, ...(fromPrefs.today || {}) },
  }
}

function rangeFromKey(key: string | undefined, now: Date): { from: Date; to: Date } {
  if (key === 'thisWeek') {
    const start = new Date(now)
    start.setDate(start.getDate() - start.getDay())
    start.setHours(0, 0, 0, 0)
    return { from: start, to: now }
  }
  if (key === 'last30days') return { from: new Date(now.getTime() - 30 * DAY), to: now }
  return currentMonthRange(now)
}

export interface HomeChips {
  activeClients: number
  openTasks: number
  net: number
  _income: number
  _expense: number
  _txCount: number
}

/* Filter-aware computation of the home tiles (clients count / open tasks /
   net). Each tile reads its slice from the resolved filters. */
export function homeChips(
  now: Date = new Date(),
  data?: { clients?: HomeClient[]; tasks?: HomeTask[]; transactions?: Tx[] },
  filters: TileFilters = DEFAULT_TILE_FILTERS,
): HomeChips {
  const { clients = [], tasks = [], transactions } = data || {}
  const f = {
    clients: { ...DEFAULT_TILE_FILTERS.clients, ...(filters.clients || {}) },
    net: { ...DEFAULT_TILE_FILTERS.net, ...(filters.net || {}) },
    tasks: { ...DEFAULT_TILE_FILTERS.tasks, ...(filters.tasks || {}) },
  }

  const activeClients = live(clients).filter((c) => {
    const meta = c.status_meta || c.status
    if (f.clients.statuses?.length && (!meta || !f.clients.statuses.includes(meta))) return false
    if (f.clients.projectIds?.length && !f.clients.projectIds.includes(c.project_id as string)) return false
    if (f.clients.groupIds?.length && !f.clients.groupIds.includes(c.group_id as string)) return false
    return true
  }).length

  const openTasks = live(tasks).filter((t) => {
    if (f.tasks.status === 'open' && t.status === 'done') return false
    if (f.tasks.status === 'done' && t.status !== 'done') return false
    if (f.tasks.priorities?.length && (!t.priority || !f.tasks.priorities.includes(t.priority))) return false
    if (f.tasks.projectIds?.length && !f.tasks.projectIds.includes(t.project_id as string)) return false
    if (f.tasks.clientScope === 'linked' && !t.client_id) return false
    return true
  }).length

  const range = rangeFromKey(f.net.timeRange, now)
  const filteredTx = financeQuery({ ...range, source: transactions }).filter((t) => {
    if (f.net.projectIds?.length && !f.net.projectIds.includes(t.project_id as string)) return false
    if (f.net.categoryIds?.length && !f.net.categoryIds.includes(t.category_id as string)) return false
    return true
  })
  let inc = 0, exp = 0
  for (const t of filteredTx) {
    if (t.type === 'income') inc += t.amount
    else if (t.type === 'expense') exp += t.amount
  }
  let net: number
  if (f.net.type === 'income') net = inc
  else if (f.net.type === 'expense') net = -exp
  else net = inc - exp

  return { activeClients, openTasks, net, _income: inc, _expense: exp, _txCount: filteredTx.length }
}

/* ── Today's agenda (home "פגישות היום" chip + drill panel) ─────────
   Merge the day's scheduled meetings, synced Google events, and lead
   follow-ups into ONE time-sorted list. `filter.kinds` controls which
   sources are included. Pure + no mock fallback. */
export interface TodayItem {
  id: string
  kind: string
  when: string | number | Date
  title: string
  phone?: string
  subjectType?: string
  subjectId?: string
  leadId?: string
  allDay?: boolean
  status?: string
  meeting?: HomeMeeting
}

const TODAY_KINDS = ['meeting', 'calendar', 'followup']

export function todayItems(
  now: Date = new Date(),
  data: { meetings?: HomeMeeting[]; calendarEvents?: HomeCalEvent[]; leads?: HomeLead[]; clients?: HomeClient[]; groups?: HomeGroup[] } = {},
  filter: { kinds?: string[] } = {},
): TodayItem[] {
  const { meetings = [], calendarEvents = [], leads = [], clients = [], groups = [] } = data
  const kinds = filter.kinds && filter.kinds.length ? filter.kinds : TODAY_KINDS
  const pad = (n: number): string => String(n).padStart(2, '0')
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const sameDay = (val: string | number | Date | null | undefined): boolean => {
    if (!val) return false
    const dt = new Date(val)
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}` === todayKey
  }
  const out: TodayItem[] = []

  if (kinds.includes('meeting')) {
    live(meetings)
      .filter((mt) => mt.status !== 'skipped' && sameDay(mt.scheduled_at))
      .forEach((mt) => {
        const isGroup = mt.subject_type === 'group'
        const subject = isGroup
          ? groups.find((g) => g.id === mt.subject_id)
          : clients.find((c) => c.id === mt.subject_id)
        out.push({
          id: `mtg-${mt.id}`, kind: 'meeting', when: mt.scheduled_at,
          title: subject?.name || '', phone: isGroup ? '' : ((subject as HomeClient)?.phone || ''),
          subjectType: mt.subject_type, subjectId: mt.subject_id, status: mt.status, meeting: mt,
        })
      })
  }

  if (kinds.includes('calendar')) {
    calendarEvents
      .filter((ev) => !ev.deleted_at && sameDay(ev.start_time))
      .forEach((ev) => out.push({
        id: `cal-${ev.id}`, kind: 'calendar', when: ev.start_time as string | number | Date,
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

  return out.sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime())
}
