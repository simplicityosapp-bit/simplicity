/* ════════════════════════════════════════════════════════════════
   CLIENTS — balance + status helpers (ported from core.js / clients.js).
   ════════════════════════════════════════════════════════════════
   Balance is membership-aware (D20): a group member's total comes from
   the group_members row; a pure-private client uses total_override or
   sessions × price. Only confirmed income counts as "paid".
   ════════════════════════════════════════════════════════════════ */

import { clients, sessions, group_members as mockMembers, groups as mockGroups } from '../data/mock'
import { financeQuery } from './finance'

const live = (a) => (a || []).filter((r) => !r.deleted_at)

export const statusMetaOf = (c) => c.status_meta || c.status || 'no_status'

export function getClientMemberships(clientId, membersData = mockMembers) {
  return live(membersData).filter((m) => m.client_id === clientId && !m.left_at)
}

function membershipTotal(m, groupsData) {
  if (m.total_override != null && m.total_override !== '') return Number(m.total_override)
  const g = groupsData.find((x) => x.id === m.group_id)
  return g ? g.package_price || 0 : 0
}

export function clientBalance(c, txns, sessionsData = sessions, membersData = mockMembers, groupsData = mockGroups) {
  const paid = financeQuery({ type: 'income', clientId: c.id, source: txns }).reduce((s, f) => s + f.amount, 0)

  const memberships = getClientMemberships(c.id, membersData)
  const memTotal = memberships.reduce((s, m) => s + membershipTotal(m, groupsData), 0)
  let privateTotal = 0
  if (memberships.length === 0) {
    privateTotal = c.total_override != null && c.total_override !== ''
      ? Number(c.total_override)
      : (c.sessions || 0) * (c.price_per_session || 0)
  }
  const total = memTotal + privateTotal

  const liveSessions = live(sessionsData)
  const privateCount = liveSessions.filter((s) => s.client_id === c.id).length
  const groupIds = memberships.map((m) => m.group_id)
  const groupCount = groupIds.length
    ? liveSessions.filter((s) => s.group_id && groupIds.includes(s.group_id)).length
    : (c.group_id ? liveSessions.filter((s) => s.group_id === c.group_id).length : 0)

  /* Session quota: client's private series + each membership's package
     (override wins over the group's default). Lets group-only clients show
     a meaningful denominator (e.g. "1/10" instead of "1/0"). */
  const memSessions = memberships.reduce((s, m) => {
    if (m.package_sessions_override != null) return s + Number(m.package_sessions_override)
    const g = groupsData.find((x) => x.id === m.group_id)
    return s + (g?.package_sessions || 0)
  }, 0)
  const sessionsTotal = (c.sessions || 0) + memSessions

  return { paid, total, balance: total - paid, sessionsPaid: privateCount + groupCount, sessionsTotal }
}

/* Sum confirmed income for a set of clients, optionally within a date range. */
export function paidForClients(arr, range = {}, txns) {
  return arr.reduce(
    (s, c) => s + financeQuery({ type: 'income', clientId: c.id, ...range, source: txns }).reduce((ss, f) => ss + f.amount, 0),
    0,
  )
}

/* Count sessions tied to a set of clients, optionally within a date range. */
export function sessionsCountForClients(arr, range = {}, sessionsData = sessions) {
  const ids = new Set(arr.map((c) => c.id))
  const from = range.from ? new Date(range.from).getTime() : null
  const to = range.to ? new Date(range.to).getTime() : null
  return live(sessionsData).filter((s) => {
    if (!ids.has(s.client_id)) return false
    if (from === null && to === null) return true
    const ts = new Date(s.date).getTime()
    if (from !== null && ts < from) return false
    if (to !== null && ts > to) return false
    return true
  }).length
}

/* All live clients grouped by status meta. */
export function clientsByMeta() {
  const all = live(clients)
  return {
    active: all.filter((c) => statusMetaOf(c) === 'active'),
    wandering: all.filter((c) => statusMetaOf(c) === 'wandering'),
    past: all.filter((c) => statusMetaOf(c) === 'past'),
    no_status: all.filter((c) => statusMetaOf(c) === 'no_status'),
  }
}
