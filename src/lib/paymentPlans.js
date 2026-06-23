/* ════════════════════════════════════════════════════════════════
   PAYMENT PLANS — pure helpers for split-payment plans (פריסת תשלומים).
   ════════════════════════════════════════════════════════════════
   A plan splits a client's total into N installments, each with a number,
   due date, amount and "received" state. The money truth stays in the
   transactions ledger: marking an installment received creates a linked
   income transaction (handled in the hook), so the balance below is just
   total − sum(received) over the installments. These helpers own only the
   arithmetic + schedule generation — no I/O, fully testable.
   ════════════════════════════════════════════════════════════════ */

/* Round to agorot (2 dp) without float drift biting on display/sums. */
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/* Add `n` months to a YYYY-MM-DD date, returning YYYY-MM-DD. Local time
   (no UTC shift) so a due date never slips a day on Israeli evenings. */
export function addMonths(isoDate, n) {
  const [y, m, d] = String(isoDate).split('-').map(Number)
  const base = new Date(y, (m - 1) + n, d || 1)
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`
}

/* The 1st of next month — the default first due date for a new plan. */
export function firstOfNextMonth(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/* Build N equal installments for a total: every installment gets the rounded
   base amount and the LAST one absorbs the rounding remainder, so the sum is
   exactly the total (never ±0.01 off). Monthly due dates from `startDate`
   (default: the 1st of next month). Returns [{ num, due_date, amount }]. */
export function generateInstallments({ total, count, startDate } = {}) {
  const n = Math.max(1, Math.floor(Number(count) || 1))
  const sum = round2(total)
  const start = startDate || firstOfNextMonth()
  const base = round2(sum / n)
  const rows = []
  for (let i = 0; i < n; i += 1) {
    const isLast = i === n - 1
    const amount = isLast ? round2(sum - base * (n - 1)) : base
    rows.push({ num: i + 1, due_date: addMonths(start, i), amount })
  }
  return rows
}

/* Plan balance from its installments. received = sum of received amounts;
   remaining = total − received (clamped at 0 — an over-collection shows 0,
   not a negative "we owe them"). Ignores soft-deleted installments. */
export function planBalance(plan, installments = []) {
  const list = (installments || []).filter((i) => !i.deleted_at)
  const total = round2(plan?.total_amount)
  const received = round2(list.filter((i) => i.received).reduce((s, i) => s + (Number(i.amount) || 0), 0))
  const receivedCount = list.filter((i) => i.received).length
  return { total, received, remaining: round2(Math.max(0, total - received)), receivedCount, count: list.length }
}

/* How many LEADING installments a given paid amount fully covers — used on
   import to mark "already paid" installments received from a client's `paid`
   total. Greedy from the first installment; stops at the first one the
   remaining balance can't fully cover (installments are received in order,
   all-or-nothing). Float-safe via a small epsilon. */
export function installmentsCoveredByPaid(amounts, paid) {
  let remaining = Number(paid) || 0
  let count = 0
  for (const a of (amounts || [])) {
    const amt = Number(a) || 0
    if (amt > 0 && remaining + 1e-6 >= amt) { remaining -= amt; count += 1 } else break
  }
  return count
}

/* Installments of a plan, sorted by number, soft-deleted dropped. */
export function planInstallments(planId, installments = []) {
  return (installments || [])
    .filter((i) => i.plan_id === planId && !i.deleted_at)
    .sort((a, b) => (a.num || 0) - (b.num || 0))
}

/* Description for the income transaction created when an installment is
   received — "תשלום 3/6 — דנה". Kept here so it's consistent everywhere. */
export function installmentDesc(inst, plan, clientName) {
  const of = plan?.num_installments || inst?.num || ''
  return `תשלום ${inst?.num || ''}/${of}${clientName ? ` — ${clientName}` : ''}`
}
