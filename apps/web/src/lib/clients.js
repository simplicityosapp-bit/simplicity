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

/* True when the coach has taken manual control of this client's status
   (migration 0062). When set, the stored status_meta wins over whatever
   the client's groups would otherwise dictate. Only meaningful for group
   members — a non-member's status is always their own stored value. */
export const isStatusOverridden = (c) => !!c?.status_overridden

/* C1 — a client who belongs to one or more groups derives their status
   from those groups (the group owns the client's lifecycle). "Active wins
   over ended": if ANY of their groups is not ended → 'active'; if they
   only sit in ended groups → 'past'. A client with no group membership —
   OR one whose status the coach has manually overridden (status_overridden,
   migration 0062) — keeps their own stored status_meta. */
export function effectiveClientMeta(c, membersData = mockMembers, groupsData = mockGroups) {
  if (!c) return 'no_status'
  if (isStatusOverridden(c)) return statusMetaOf(c)
  const memberships = getClientMemberships(c.id, membersData)
  if (!memberships.length) return statusMetaOf(c)
  const statuses = memberships
    .map((m) => (groupsData || []).find((g) => g.id === m.group_id))
    .filter(Boolean)
    .map((g) => g.status)
  if (!statuses.length) return statusMetaOf(c)
  return statuses.some((s) => s !== 'ended') ? 'active' : 'past'
}

/* True when the client's status is currently being driven by a group:
   they're a member AND haven't been manually overridden. The card shows a
   read-only "by group" hint in this state; once overridden, the manual
   picker takes over. */
export function isGroupDriven(c, membersData = mockMembers) {
  return !!c && !isStatusOverridden(c) && getClientMemberships(c.id, membersData).length > 0
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
  /* "שולם" = real confirmed income + paid_adjustment (an INFORMAL paid
     credit recorded from the card via "התעלם" — money received but not
     entered as a finance transaction). The separate balance_adjustment is
     a forgiveness that lowers the BALANCE without touching "שולם", so
     zeroing a balance never freezes the price × sessions engine. */
  const paidReal = financeQuery({ type: 'income', clientId: c.id, source: txns }).reduce((s, f) => s + f.amount, 0)
  const adjustment = Number(c.balance_adjustment) || 0
  const paid = paidReal + (Number(c.paid_adjustment) || 0)

  const memberships = getClientMemberships(c.id, membersData)
  const liveSess = live(sessionsData)
  /* Sessions held per group — needed for per-session billing. Counts
     all group sessions (the package/per-session rate applies per member). */
  const heldForGroup = (gid) => liveSess.filter((s) => s.group_id === gid).length
  const memTotal = memberships.reduce(
    (s, m) => s + membershipTotal(m, groupsData, heldForGroup(m.group_id)),
    0,
  )
  /* Ended groups leave the RUNNING session balance (beta decision
     04/06/2026): their sessions and quotas stay visible per-group as
     history (the `ended` flag on groupSessions) but no longer feed the
     current counters. Money is intentionally untouched — group dues and
     payments don't evaporate when a group closes. */
  const isEndedGroup = (gid) => (groupsData || []).find((x) => x.id === gid)?.status === 'ended'
  const activeMemberships = memberships.filter((m) => !isEndedGroup(m.group_id))

  const liveSessions = live(sessionsData)
  const privateCount = liveSessions.filter((s) => s.client_id === c.id).length

  /* Billing is ALWAYS per-client: a member owes their group dues (memTotal)
     PLUS any private 1-on-1 series they run on the side. A pure group member
     simply has no private sessions/price, so privateTotal is 0. A manual
     total_override (when set — including an explicit 0 for "free") overrides
     the private total in BOTH billing modes (override always wins, like
     group memberships). billing_mode (migration 0014):
       - 'package'     → sessions × price_per_session  (the original model)
       - 'per_session' → sessions actually held × price_per_session — for
                         practitioners who work meeting-to-meeting with no
                         preset quota (per-session-billing.spec.md). */
  const perSession = c.billing_mode === 'per_session'
  const privateDoneForBilling = privateCount + (Number(c.sessions_done_adjustment) || 0)
  const privateTotal = c.total_override != null && c.total_override !== ''
    ? Number(c.total_override)
    : perSession
      ? privateDoneForBilling * (c.price_per_session || 0)
      : (c.sessions || 0) * (c.price_per_session || 0)
  const total = memTotal + privateTotal
  const groupIds = activeMemberships.map((m) => m.group_id)
  const groupCount = memberships.length
    ? liveSessions.filter((s) => s.group_id && groupIds.includes(s.group_id)).length
    : (c.group_id && !isEndedGroup(c.group_id) ? liveSessions.filter((s) => s.group_id === c.group_id).length : 0)

  /* Session quota: client's private series + each ACTIVE membership's
     package (override wins over the group's default). Lets group-only
     clients show a meaningful denominator (e.g. "1/10" instead of "1/0"). */
  const memSessions = activeMemberships.reduce((s, m) => {
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
  /* A per-session client is ALWAYS "personal" — their whole billing model
     is the private meeting count, even before the first one is logged. */
  const hasPersonal = perSession || personalQuota > 0 || privateCount > 0 || doneAdj !== 0
  const groupSessions = memberships.map((m) => {
    const g = groupsData.find((x) => x.id === m.group_id)
    const quota = m.package_sessions_override != null ? Number(m.package_sessions_override) : (g?.package_sessions || 0)
    return { id: m.group_id, name: g?.name || 'קבוצה', quota, held: heldForGroup(m.group_id), ended: g?.status === 'ended' }
  })

  return {
    paid, paidReal, adjustment, total, memberTotal: memTotal,
    balance: total - paid - adjustment,
    sessionsPaid: privateCount + groupCount, sessionsTotal,
    personalQuota, personalHeld, personalDone, hasPersonal, groupSessions,
    perSession,
  }
}

/* Sum confirmed income for a set of clients, optionally within a date range. */
export function paidForClients(arr, range = {}, txns) {
  return arr.reduce(
    (s, c) => s + financeQuery({ type: 'income', clientId: c.id, ...range, source: txns }).reduce((ss, f) => ss + f.amount, 0),
    0,
  )
}

/* Count sessions tied to a set of clients, optionally within a date range.
   Includes BOTH private (1-on-1) sessions AND each client's active-group
   sessions — mirroring clientBalance.sessionsPaid (every member "attends" the
   group's sessions), so the monthly count matches cumulative (formula §4.1 =
   private + active-group sessions). */
export function sessionsCountForClients(arr, range = {}, sessionsData = sessions, membersData = mockMembers, groupsData = mockGroups) {
  const from = range.from ? new Date(range.from).getTime() : null
  const to = range.to ? new Date(range.to).getTime() : null
  const inRange = (s) => {
    if (from === null && to === null) return true
    const ts = new Date(s.date).getTime()
    if (from !== null && ts < from) return false
    if (to !== null && ts > to) return false
    return true
  }
  const liveSess = live(sessionsData)
  const ids = new Set(arr.map((c) => c.id))
  let count = liveSess.filter((s) => s.client_id && ids.has(s.client_id) && inRange(s)).length
  const isEndedGroup = (gid) => (groupsData || []).find((x) => x.id === gid)?.status === 'ended'
  for (const c of arr) {
    const memberships = getClientMemberships(c.id, membersData)
    let gids = memberships.filter((m) => !isEndedGroup(m.group_id)).map((m) => m.group_id)
    if (!memberships.length && c.group_id && !isEndedGroup(c.group_id)) gids = [c.group_id]
    if (gids.length) count += liveSess.filter((s) => s.group_id && gids.includes(s.group_id) && inRange(s)).length
  }
  return count
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
