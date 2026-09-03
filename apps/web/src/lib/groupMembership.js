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
   ════════════════════════════════════════════════════════════════ */

/* A fresh membership row — every column the insert needs, and no
   override. Three call sites used to hand-roll this same literal. */
export function newMembership(groupId, clientId, joinedAt = new Date().toISOString()) {
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

const liveOf = (memberships) => (memberships || []).filter((m) => !m.left_at && !m.deleted_at)

/* The client's single group tag moved from `prevGroupId` to `nextGroupId`
   (either may be empty). Which membership rows have to go, and which
   group needs a row it does not have yet.

   "Move" semantics, the same the project screen's "העברה לכאן" uses: the
   old group's row is closed, the new group gets one unless it already
   exists. Memberships in OTHER groups are left alone — the tag only ever
   named one of them, so a change to it says nothing about the rest. */
export function groupMembershipPlan({ prevGroupId, nextGroupId, memberships }) {
  const prev = prevGroupId || null
  const next = nextGroupId || null
  if (prev === next) return { remove: [], add: [] }
  const live = liveOf(memberships)
  const remove = prev ? live.filter((m) => m.group_id === prev).map((m) => m.id) : []
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
const num = (v) => Number(v) || 0

export function membershipQuota(membership, group) {
  return membership?.package_sessions_override != null
    ? num(membership.package_sessions_override)
    : num(group?.package_sessions)
}

export function membershipDues(membership, group) {
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
export function packageUnitPrice(group) {
  const sessions = num(group?.package_sessions)
  return sessions > 0 ? num(group?.package_price) / sessions : 0
}

/* The membership after selling `count` more meetings. Rounded to the agora
   because the unit price is a division and a package of 3 for ₪1,000 would
   otherwise put a repeating decimal into someone's balance. */
export function renewedCard({ currentQuota = 0, currentTotal = 0, unitPrice = 0, count = 0 }) {
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
export function nextGroupTag(clientId, removedId, memberships) {
  const other = liveOf(memberships).find((m) => m.client_id === clientId && m.id !== removedId)
  return other?.group_id ?? null
}
