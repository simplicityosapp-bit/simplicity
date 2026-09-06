/* ════════════════════════════════════════════════════════════════
   CLIENTS — balance + status helpers (ported from core.js / clients.js).
   ════════════════════════════════════════════════════════════════
   Balance is membership-aware (D20): a group member's total comes from
   the group_members row; a pure-private client uses total_override or
   sessions × price. Only confirmed income counts as "paid".
   ════════════════════════════════════════════════════════════════ */

import { financeQuery, type Tx } from './finance'
import { getClientMemberships, isStatusOverridden } from './scheduledMeetings'

export interface Client {
  id: string
  status_meta?: string
  status?: string
  status_overridden?: boolean
  balance_adjustment?: number | string | null
  paid_adjustment?: number | string | null
  billing_mode?: string
  sessions_done_adjustment?: number | string | null
  total_override?: number | string | null
  price_per_session?: number | null
  sessions?: number | null
  group_id?: string | null
  deleted_at?: string | null
}
export interface GroupMembership {
  client_id?: string
  group_id?: string
  left_at?: string | null
  total_override?: number | string | null
  package_sessions_override?: number | string | null
  deleted_at?: string | null
}
export interface Group {
  id: string
  status?: string
  billing_mode?: string
  price_per_session?: number | null
  package_price?: number | null
  package_sessions?: number | null
  name?: string
  deleted_at?: string | null
}
export interface ClientSession {
  client_id?: string
  group_id?: string
  date?: string | number | Date
  deleted_at?: string | null
}
interface DateRange { from?: string | number | Date | null; to?: string | number | Date | null }

/* One thing a client pays for: a group they belong to, or their personal
   process. A client's account is the sum of their tracks — see the `tracks`
   block at the end of clientBalance for why they are named rather than left
   as one lump. `quota` is null when the model has no fixed number of
   meetings to count towards (per-session billing).

   `paid` is the money this track has actually received, from transactions
   that say which group they were for (migration 0115). `balance` is what is
   left on it. Money the tracks cannot claim is reported separately as
   `unallocatedPaid` rather than spread over them by guesswork. */
export interface ClientTrack {
  kind: 'group' | 'personal'
  id: string
  name: string
  mode: string
  held: number
  quota: number | null
  total: number
  paid: number
  balance: number
  ended: boolean
}

const live = <T extends { deleted_at?: string | null }>(a: T[] | null | undefined): T[] =>
  (a || []).filter((r) => !r.deleted_at)

/* C1 — a client who belongs to one or more groups derives their status from
   those groups (the group owns the client's lifecycle). "Active wins over
   ended": if ANY of their groups is not ended → 'active'; if they only sit
   in ended groups → 'past'. A client with no membership — or one manually
   overridden (status_overridden, migration 0062) — keeps their own stored
   status_meta.

   The four rules themselves live in ./scheduledMeetings, the one file in
   this package that imports nothing: the meetings engine needs them and the
   nightly cron bundles that file into a Deno edge function, which cannot
   resolve this package's extensionless imports. Re-exported here so every
   existing `from './clients'` keeps working and each rule still has exactly
   one definition. */
export { statusMetaOf, getClientMemberships, isStatusOverridden, effectiveClientMeta } from './scheduledMeetings'

/* True when the client's status is currently being driven by a group:
   they're a member AND haven't been manually overridden. The card shows a
   read-only "by group" hint in this state; once overridden, the manual
   picker takes over. */
export function isGroupDriven(c: Client | null | undefined, membersData: GroupMembership[] = []): boolean {
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
function membershipTotal(m: GroupMembership, groupsData: Group[], heldCount = 0): number {
  if (m.total_override != null && m.total_override !== '') return Number(m.total_override)
  const g = groupsData.find((x) => x.id === m.group_id)
  if (!g) return 0
  const mode = g.billing_mode || 'package'
  if (mode === 'per_session') return (g.price_per_session || 0) * heldCount
  if (mode === 'none') return 0
  return g.package_price || 0
}

export function clientBalance(c: Client, txns?: Tx[], sessionsData: ClientSession[] = [], membersData: GroupMembership[] = [], groupsData: Group[] = []) {
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
  const heldForGroup = (gid?: string) => liveSess.filter((s) => s.group_id === gid).length
  const memTotal = memberships.reduce(
    (s, m) => s + membershipTotal(m, groupsData, heldForGroup(m.group_id)),
    0,
  )
  /* Ended groups leave the RUNNING session balance (beta decision
     04/06/2026): their sessions and quotas stay visible per-group as
     history (the `ended` flag on groupSessions) but no longer feed the
     current counters. Money is intentionally untouched — group dues and
     payments don't evaporate when a group closes. */
  const isEndedGroup = (gid?: string) => (groupsData || []).find((x) => x.id === gid)?.status === 'ended'
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
  /* A per-session client's allotment. When the coach has recorded how many
     meetings are booked ahead, that IS the allotment and it reads like any
     other client. When they have not, `sessions` is 0 — and counting that 0
     while every meeting they held counted as done let the clients-screen
     summary print MORE done than allotted (a per-session-heavy practice
     drifted to "12/4"). The fallback is the done count, which is exactly how
     the money side already defines their bill one screen up: privateTotal is
     done × price. Each held meeting then adds one to both sides and the ratio
     cannot overflow on its own. It still can once a plan is entered and
     exceeded — that overflow is real, and package clients have always shown
     it the same way. */
  const sessionsTotal = (perSession ? ((c.sessions || 0) || privateDoneForBilling) : (c.sessions || 0)) + memSessions

  /* Sessions split into PERSONAL (1-on-1) vs each GROUP the client is in.
     "נעשה" (done) = real private session records + the manual
     sessions_done_adjustment (for imported clients with no per-session
     records). Group sessions are read-only — they come from the group. */
  const doneAdj = Number(c.sessions_done_adjustment) || 0
  const personalQuota = c.sessions || 0
  const personalHeld = privateCount
  const personalDone = privateCount + doneAdj
  /* Does this client have a PERSONAL track at all?

     For a client in no group the question does not arise: the personal side
     IS the account, so it is always there — which is what every 1-on-1 client
     already did and keeps doing.

     For a group member it is a real question, and the answer used to be "yes,
     always". The add and edit forms offer a quota, a price and a manual total
     to everyone, so a coach who typed the GROUP's eight meetings into «מספר
     פגישות» gave that member a private series of eight nobody asked for. It
     printed as "0/8" beside the group's own "1/8"; and when the group's price
     went into «סה״כ לתשלום» as well, the same dues were charged twice.

     A member has a personal track when something in the data says so: a
     private meeting on the books, a price of their own, a manual total, a
     quota, or an imported done-count. Nothing is ignored and nothing is
     rewritten — a quota typed in by mistake still shows, now beside the group
     line that explains it, where the coach can see both and decide. */
  const hasPersonal = !memberships.length || (
    privateCount > 0
    || doneAdj !== 0
    || (c.price_per_session || 0) > 0
    || (c.total_override != null && c.total_override !== '')
    || personalQuota > 0
  )
  const groupSessions = memberships.map((m) => {
    const g = groupsData.find((x) => x.id === m.group_id)
    const quota = m.package_sessions_override != null ? Number(m.package_sessions_override) : (g?.package_sessions || 0)
    return {
      id: m.group_id,
      name: g?.name || 'קבוצה',
      quota,
      held: heldForGroup(m.group_id),
      ended: g?.status === 'ended',
      /* What this membership costs, and under which model — the two facts a
         reader needs to tell one line of the bill from another. Summed into
         memberTotal above; named here so each line can state its own share
         instead of leaving the client with one total and no way to split it. */
      mode: (g?.billing_mode || 'package') as string,
      total: membershipTotal(m, groupsData, heldForGroup(m.group_id)),
    }
  })

  /* ── The tracks ────────────────────────────────────────────────
     One entry per thing this client pays for: each group they belong to, and
     their personal process when they have one. The account is the sum; the
     tracks are what it is made of.

     Every figure here is computed above — this only NAMES the parts, so a
     card, a file and a form can say the same thing about them instead of each
     re-deriving its own split out of `total` and `memberTotal`. */
  /* Which money each track has received. A payment says which group it was
     for (transactions.group_id, migration 0115); one that says nothing is the
     personal process, or was recorded before there was anything to say.

     A client with exactly ONE track is not asked the question at all — there
     is only one thing they could be paying for — so their single track takes
     the whole of `paid`, including the informal «שולם» adjustment, whatever
     the column happens to hold. That is also what keeps every account that
     existed before this migration adding up. */
  const confirmedIncome = financeQuery({ type: 'income', clientId: c.id, source: txns })
  const paidForGroup = (gid?: string) => confirmedIncome
    .filter((f) => f.group_id === gid)
    .reduce((s, f) => s + f.amount, 0)
  const groupTrackIds = new Set(groupSessions.map((gs) => gs.id))
  /* Income that names no group of this client's — the personal side, when
     they have one. */
  const looseIncome = confirmedIncome
    .filter((f) => !f.group_id || !groupTrackIds.has(f.group_id))
    .reduce((s, f) => s + f.amount, 0)

  const trackCount = groupSessions.length + (hasPersonal ? 1 : 0)
  const single = trackCount === 1
  const withMoney = (total: number, trackPaid: number) => ({
    total,
    paid: trackPaid,
    balance: total - trackPaid,
  })

  const tracks: ClientTrack[] = [
    ...groupSessions.map((gs) => ({
      kind: 'group' as const,
      id: gs.id || '',
      name: gs.name,
      mode: gs.mode,
      held: gs.held,
      /* A per-session group bills what took place; there is no quota to count
         towards, and printing "/0" invented a target of nothing. */
      quota: gs.mode === 'per_session' ? null : (gs.quota || null),
      ended: gs.ended,
      ...withMoney(gs.total, single ? paid : paidForGroup(gs.id)),
    })),
    ...(hasPersonal ? [{
      kind: 'personal' as const,
      id: 'personal',
      name: '',
      mode: perSession ? 'per_session' : 'package',
      held: personalDone,
      /* Same rule as the group above, and the same one the client card has
         always applied to a per-session client with nothing booked ahead. */
      quota: perSession && !personalQuota ? null : personalQuota,
      ended: false,
      /* The informal «שולם» correction is a client-level fact with no group
         on it, so it lands here with the rest of the unattributed money. */
      ...withMoney(privateTotal, single ? paid : looseIncome + (Number(c.paid_adjustment) || 0)),
    }] : []),
  ]

  /* Money received that no track claims: a client in two groups whose payment
     names neither. Reported rather than spread over the tracks by guesswork —
     the same choice the payments panel makes for an unexplained adjustment. */
  const unallocatedPaid = single || hasPersonal ? 0 : looseIncome + (Number(c.paid_adjustment) || 0)

  return {
    paid, paidReal, adjustment, total, memberTotal: memTotal, privateTotal,
    balance: total - paid - adjustment,
    sessionsPaid: privateCount + groupCount, sessionsTotal,
    personalQuota, personalHeld, personalDone, hasPersonal, groupSessions,
    perSession, tracks, unallocatedPaid,
  }
}

/* What a payment from this client could be FOR — the choices the payment form
   offers, and nothing more.

   Empty when there is nothing to disambiguate: a client in no group has only
   their personal process, and a pure group member has only the group. Asking
   either of them which of their one thing a payment was for is a field that
   can only be answered one way.

   Deliberately reads the CLIENT ROW for the personal side rather than their
   logged sessions, so the form needs no more data than it already loads (the
   five screens that open it do not all hold `sessions`). The gap that leaves
   is a member with a private meeting logged and no price, no quota and no
   manual total — who owes nothing personally, so a payment of theirs belongs
   to the group regardless. */
export function clientPaymentTargets(
  c: Client | null | undefined,
  membersData: GroupMembership[] = [],
  groupsData: Group[] = [],
): { id: string; name: string; kind: 'group' | 'personal' }[] {
  if (!c) return []
  const groups = getClientMemberships(c.id, membersData)
    .map((m) => groupsData.find((g) => g.id === m.group_id))
    .filter((g): g is Group => !!g && !g.deleted_at)
  if (!groups.length) return []
  const personal = (c.price_per_session || 0) > 0
    || (c.total_override != null && (c.total_override as unknown) !== '')
    || (c.sessions || 0) > 0
    || (Number(c.sessions_done_adjustment) || 0) !== 0
  if (groups.length === 1 && !personal) return []
  return [
    ...groups.map((g) => ({ id: g.id!, name: g.name || '', kind: 'group' as const })),
    { id: '', name: '', kind: 'personal' as const },
  ]
}

/* Sum confirmed income for a set of clients, optionally within a date range. */
export function paidForClients(arr: Client[], range: DateRange = {}, txns?: Tx[]): number {
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
export function sessionsCountForClients(arr: Client[], range: DateRange = {}, sessionsData: ClientSession[] = [], membersData: GroupMembership[] = [], groupsData: Group[] = []): number {
  const from = range.from ? new Date(range.from).getTime() : null
  const to = range.to ? new Date(range.to).getTime() : null
  const inRange = (s: ClientSession) => {
    if (from === null && to === null) return true
    const ts = new Date(s.date ?? 0).getTime()
    if (from !== null && ts < from) return false
    if (to !== null && ts > to) return false
    return true
  }
  const liveSess = live(sessionsData)
  const ids = new Set(arr.map((c) => c.id))
  let count = liveSess.filter((s) => s.client_id && ids.has(s.client_id) && inRange(s)).length
  const isEndedGroup = (gid?: string) => (groupsData || []).find((x) => x.id === gid)?.status === 'ended'
  for (const c of arr) {
    const memberships = getClientMemberships(c.id, membersData)
    let gids = memberships.filter((m) => !isEndedGroup(m.group_id)).map((m) => m.group_id)
    if (!memberships.length && c.group_id && !isEndedGroup(c.group_id)) gids = [c.group_id]
    if (gids.length) count += liveSess.filter((s) => s.group_id && gids.includes(s.group_id) && inRange(s)).length
  }
  return count
}
