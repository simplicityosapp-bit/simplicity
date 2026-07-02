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
  deleted_at?: string | null
  status?: string
  status_meta?: string
  project_id?: string | null
  group_id?: string | null
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
