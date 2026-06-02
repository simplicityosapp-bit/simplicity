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

/* C1 — a client who belongs to one or more groups derives their status
   from those groups (the group owns the client's lifecycle). "Active wins
   over ended": if ANY of their groups is not ended → 'active'; if they
   only sit in ended groups → 'past'. A client with no group membership
   keeps their own stored status_meta. */
export function effectiveClientMeta(c, membersData = mockMembers, groupsData = mockGroups) {
  if (!c) return 'no_status'
  const memberships = getClientMemberships(c.id, membersData)
  if (!memberships.length) return statusMetaOf(c)
  const statuses = memberships
    .map((m) => (groupsData || []).find((g) => g.id === m.group_id))
    .filter(Boolean)
    .map((g) => g.status)
  if (!statuses.length) return statusMetaOf(c)
  return statuses.some((s) => s !== 'ended') ? 'active' : 'past'
}

/* True when the client's status is being driven by a group (so manual
   status editing in the card is disabled). */
export function isGroupDriven(c, membersData = mockMembers) {
  return !!c && getClientMemberships(c.id, membersData).length > 0
}

/* Total owed for one group membership. A per-member override always
   wins. Otherwise the group's billing_mode decides:
     - 'package'     → the fixed package_price.
     - 'per_session' → price_per_session × sessions actually held for
                       this group (passed in via heldCount).
     - 'none'        → no group-level price (0 unless an override exists).
   Legacy rows have no billing_mode; they default to 'package', matching
   their pre-migration behaviour exactly. */
function membershipTotal(m, groupsData, heldCount = 0) {
  if (m.total_override != null && m.total_override !== '') return Number(m.total_override)
  const g = groupsData.find((x) => x.id === m.group_id)
  if (!g) return 0
  const mode = g.billing_mode || 'package'
  if (mode === 'per_session') return (g.price_per_session || 0) * heldCount
  if (mode === 'none') return 0
  return g.package_price || 0
}

export function clientBalance(c, txns, sessionsData = sessions, membersData = mockMembers, groupsData = mockGroups) {
  /* "שולם" = real confirmed income only — it stays put. The manual
     balance_adjustment (a forgiveness/credit) reduces the BALANCE directly,
     so zeroing a balance after a price change never touches "שולם" and
     never freezes the price × sessions engine. */
  const paidReal = financeQuery({ type: 'income', clientId: c.id, source: txns }).reduce((s, f) => s + f.amount, 0)
  const adjustment = Number(c.balance_adjustment) || 0
  const paid = paidReal

  const memberships = getClientMemberships(c.id, membersData)
  const liveSess = live(sessionsData)
  /* Sessions held per group — needed for per-session billing. Counts
     all group sessions (the package/per-session rate applies per member). */
  const heldForGroup = (gid) => liveSess.filter((s) => s.group_id === gid).length
  const memTotal = memberships.reduce(
    (s, m) => s + membershipTotal(m, groupsData, heldForGroup(m.group_id)),
    0,
  )
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

  /* Sessions split into PERSONAL (1-on-1) vs each GROUP the client is in.
     "נעשה" (done) = real private session records + the manual
     sessions_done_adjustment (for imported clients with no per-session
     records). Group sessions are read-only — they come from the group. */
  const doneAdj = Number(c.sessions_done_adjustment) || 0
  const personalQuota = c.sessions || 0
  const personalHeld = privateCount
  const personalDone = privateCount + doneAdj
  const hasPersonal = personalQuota > 0 || privateCount > 0 || doneAdj !== 0
  const groupSessions = memberships.map((m) => {
    const g = groupsData.find((x) => x.id === m.group_id)
    const quota = m.package_sessions_override != null ? Number(m.package_sessions_override) : (g?.package_sessions || 0)
    return { id: m.group_id, name: g?.name || 'קבוצה', quota, held: heldForGroup(m.group_id) }
  })

  return {
    paid, paidReal, adjustment, total, memberTotal: memTotal,
    balance: total - paid - adjustment,
    sessionsPaid: privateCount + groupCount, sessionsTotal,
    personalQuota, personalHeld, personalDone, hasPersonal, groupSessions,
  }
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
