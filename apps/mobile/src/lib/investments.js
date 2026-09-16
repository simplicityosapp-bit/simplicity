/* ════════════════════════════════════════════════════════════════
   RECORDING AN INVESTMENT — two rows, one action (web useInvestments).
   ════════════════════════════════════════════════════════════════
   "השקעתי" writes an expense transaction, so the money leaves the ledger
   and shows in נטו like any other outgoing, and an `investments` row linked
   to it (transaction_id), which is the feature's own memory. The widget's
   base excludes exactly those linked transaction ids (core
   computeInvestment) — by id, never by category name.

   Pure with its writes injected, so the two invariants are testable
   without a database: both rows carry the SAME day, and an expense whose
   record failed is rolled back — an unlinked expense would keep shrinking
   next month's target for money the widget never saw.
   ════════════════════════════════════════════════════════════════ */

/* YYYY-MM-DD in LOCAL time — invested_on is a DATE column, and the column's
   own default is UTC: after midnight in Israel it would file under yesterday. */
export function localDateString(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const INVESTMENT_CATEGORY_COLOR = '#8855cc'

export async function recordInvestmentPair({ amount, investedOn, note } = {}, { ensureCategory, addTransaction, insertInvestment, rollbackTransaction, txDesc }) {
  /* Whole shekels: the button printed isr(amount), which rounds — so the
     ledger, נטו and the invested total store what was shown. */
  const value = Math.round(Number(amount) || 0)
  if (value <= 0) return null
  // Resolved once for both rows, so they can never straddle a month boundary.
  const day = investedOn || localDateString()
  const categoryId = await ensureCategory()
  const tx = await addTransaction({ amount: value, type: 'expense', date: day, desc: txDesc, category_id: categoryId, status: 'confirmed' })
  try {
    return await insertInvestment({ amount: value, invested_on: day, transaction_id: tx?.id ?? null, note: note || null })
  } catch (e) {
    if (tx?.id) await Promise.resolve().then(() => rollbackTransaction(tx.id)).catch(() => {})
    throw e
  }
}

/* The investments still standing, as the finance list sees them. Deleting an
   investment's expense soft-deletes the record server-side (lib/
   linkedInvestments); hiding a record whose expense is gone from the loaded
   ledger keeps the widget right without a round-trip, and restoring the
   expense brings it straight back. */
export function liveInvestments(investments, transactions, transactionsLoaded) {
  if (!transactionsLoaded) return investments
  const ids = new Set((transactions || []).map((t) => t.id))
  return (investments || []).filter((r) => !r.transaction_id || ids.has(r.transaction_id))
}
