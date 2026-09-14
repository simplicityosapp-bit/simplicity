/* ════════════════════════════════════════════════════════════════
   GROUP MEMBERSHIP — one rule for the two records that both say
   "this client is in that group".
   ════════════════════════════════════════════════════════════════
   A membership is a group_members row (D20: the source of truth for
   the roster, the client's group-driven status and their group dues).
   The client row ALSO carries group_id — a single-group tag left over
   from before memberships existed, still read by the project screen's
   client list and by the client file's session feed.

   The two drifted. The edit form wrote the tag and never a row, so the
   roster said "שני חברים" and showed one chip, and the client owed the
   group nothing. Removing a chip dropped the row and never the tag, so
   the chip was gone while the client's row still said "מעגל בוקר".
   Every writer of one record now comes through here to decide what
   happens to the other.

   Moved here from apps/web/src/lib so the phone uses the same rule: its
   add and edit forms wrote the tag and never a row, exactly the drift
   the web fixed, because the rule lived where only the web could reach it.
   ════════════════════════════════════════════════════════════════ */

interface Membership {
  id?: string
  group_id?: string | null
  client_id?: string | null
  left_at?: string | null
  deleted_at?: string | null
  total_override?: number | string | null
  package_sessions_override?: number | string | null
}

interface GroupPricing {
  package_sessions?: number | string | null
  package_price?: number | string | null
}

/* A fresh membership row — every column the insert needs, and no
   override. Three call sites used to hand-roll this same literal. */
export function newMembership(groupId: string, clientId: string, joinedAt: string = new Date().toISOString()) {
  return {
    group_id: groupId,
    client_id: clientId,
    joined_at: joinedAt,
    left_at: null,
    total_override: null,
    has_custom_price: false,
    package_sessions_override: null,
    left_mid_process: false,
  }
}

const liveOf = (memberships: Membership[] | null | undefined) =>
  (memberships || []).filter((m) => !m.left_at && !m.deleted_at)

/* The client's single group tag moved from `prevGroupId` to `nextGroupId`
   (either may be empty). Which membership rows have to go, and which
   group needs a row it does not have yet.

   "Move" semantics, the same the project screen's "העברה לכאן" uses: the
   old group's row is closed, the new group gets one unless it already
   exists. Memberships in OTHER groups are left alone — the tag only ever
   named one of them, so a change to it says nothing about the rest. */
export function groupMembershipPlan({ prevGroupId, nextGroupId, memberships }: {
  prevGroupId?: string | null
  nextGroupId?: string | null
  memberships?: Membership[] | null
}): { remove: string[], add: string[] } {
  const prev = prevGroupId || null
  const next = nextGroupId || null
  if (prev === next) return { remove: [], add: [] }
  const live = liveOf(memberships)
  const remove = prev ? live.filter((m) => m.group_id === prev).map((m) => m.id as string) : []
  const add = next && !live.some((m) => m.group_id === next) ? [next] : []
  return { remove, add }
}

/* ── One member's card of meetings ──────────────────────────────
   A group priced as a package sells meetings in blocks. Which block a
   member holds is theirs, not the group's: one student renews for another
   ten classes and the rest do not. Both numbers live on the membership —
   the quota they may attend, and the dues that came with it — and each
   falls back to the group's when it was never set individually. Same
   precedence clientBalance applies when it bills them. */
const num = (v: unknown) => Number(v) || 0

export function membershipQuota(membership: Membership | null | undefined, group: GroupPricing | null | undefined): number {
  return membership?.package_sessions_override != null
    ? num(membership.package_sessions_override)
    : num(group?.package_sessions)
}

export function membershipDues(membership: Membership | null | undefined, group: GroupPricing | null | undefined): number {
  return membership?.total_override != null && membership?.total_override !== ''
    ? num(membership.total_override)
    : num(group?.package_price)
}

/* What one meeting of the package costs. The group's package price spread
   over the meetings it buys — the rule the owner chose for a renewal
   (2026-09-03): the debt grows by the group's defined price, and a
   different figure for one member goes in the per-member override that
   already exists on their client card. Zero when the group sells no
   package, which is the case where a renewal has no price to charge. */
export function packageUnitPrice(group: GroupPricing | null | undefined): number {
  const sessions = num(group?.package_sessions)
  return sessions > 0 ? num(group?.package_price) / sessions : 0
}

/* The membership after selling `count` more meetings. Rounded to the agora
   because the unit price is a division and a package of 3 for ₪1,000 would
   otherwise put a repeating decimal into someone's balance. */
export function renewedCard({ currentQuota = 0, currentTotal = 0, unitPrice = 0, count = 0 }: {
  currentQuota?: number | string
  currentTotal?: number | string
  unitPrice?: number | string
  count?: number | string
}) {
  const n = Math.max(0, Math.trunc(num(count)))
  return {
    quota: num(currentQuota) + n,
    total: Math.round((num(currentTotal) + n * num(unitPrice)) * 100) / 100,
    count: n,
  }
}

/* The tag a client row should carry once membership `removedId` is gone:
   another live group they are still in, or nothing. Keeps a client who
   sits in two groups from reading "פרטי" the moment they leave one. */
export function nextGroupTag(clientId: string, removedId: string, memberships: Membership[] | null | undefined): string | null {
  const other = liveOf(memberships).find((m) => m.client_id === clientId && m.id !== removedId)
  return other?.group_id ?? null
}
