import { isr } from '@simplicity/core'

/* ════════════════════════════════════════════════════════════════
   CLIENT ADJUSTMENTS — a figure moved by hand, with a reason and a date.
   ════════════════════════════════════════════════════════════════
   Port of web's hooks/useClientAdjustments.js, with the writes injected so
   the ordering rules can be tested without a database.

   clients.paid_adjustment / balance_adjustment REMAIN the source of truth
   that core clientBalance reads; a client_adjustments row (migration 0095)
   only EXPLAINS the number. The two move together:

     · adding: scalar FIRST, then the row. If the insert fails the balance
       is still right and only the explanation is missing — a wrong balance
       is a money bug, a missing note is cosmetic. The insert is non-fatal.
     · removing: row FIRST, then the scalar. If the scalar write fails the
       row is put straight back, so the pair cannot drift either way.

   The scalar is always read FRESH from the database, never from the client
   object on screen: that copy lags the refetch, so two adjustments in quick
   succession both read the pre-first value and the second overwrote the
   first. Undo restores the exact prior value rather than subtracting, so a
   concurrent edit cannot compound.
   ════════════════════════════════════════════════════════════════ */

export const ADJUSTMENT_COLUMN = { paid: 'paid_adjustment', balance: 'balance_adjustment' }

/* A CHECK constraint binds each reason to exactly one kind. */
export const ADJUSTMENT_REASONS = [
  { k: 'discount', kind: 'balance', labelKey: 'adjust.reasonDiscount' },
  { k: 'import_fix', kind: 'paid', labelKey: 'adjust.reasonImportFix' },
  { k: 'unrecorded_payment', kind: 'paid', labelKey: 'adjust.reasonUnrecorded' },
]

// Sign from the AMOUNT: a correction downward is a negative 'paid' adjustment.
export const signedAmount = (n) => `${(Number(n) || 0) < 0 ? '−' : '+'}${isr(Math.abs(Number(n) || 0))}`

/* What the rows do not account for. Anything that moved the scalar without a
   row (an older build, an import, a hand edit in the database) shows as its
   own line, so the total always adds up. null when there is no gap. */
export function unexplainedGap(client, column, rows) {
  const scalar = Number(client?.[column]) || 0
  const explained = (rows || []).reduce((s, a) => s + (Number(a.amount) || 0), 0)
  const gap = Math.round((scalar - explained) * 100) / 100
  return gap === 0 ? null : gap
}

export async function applyAdjustment({ client, kind, reason, amount, note = null, readScalar, writeScalar, insertRow, removeRow, restoreRow, pushUndo, undoLabel = '', onChanged }) {
  const delta = Number(amount) || 0
  const col = ADJUSTMENT_COLUMN[kind]
  if (!col || !client?.id) throw new Error('invalid adjustment')
  const fresh = await readScalar(client.id, col)
  const before = Number(fresh ?? client[col]) || 0
  await writeScalar(client.id, { [col]: before + delta })
  onChanged?.()
  let row = null
  try {
    row = await insertRow({ client_id: client.id, kind, reason, amount: delta, note: note || null })
  } catch { /* the balance is right; the payments panel shows it as unexplained */ }
  pushUndo?.({
    label: undoLabel,
    undo: async () => {
      await writeScalar(client.id, { [col]: before }).catch(() => {})
      if (row) await removeRow(row.id).catch(() => {})
      onChanged?.()
    },
    redo: async () => {
      await writeScalar(client.id, { [col]: before + delta }).catch(() => {})
      if (row) await restoreRow(row.id).catch(() => {})
      onChanged?.()
    },
  })
  return row
}

export async function retractAdjustment({ client, adjustment, readScalar, writeScalar, removeRow, restoreRow, pushUndo, undoLabel = '', onChanged }) {
  const delta = Number(adjustment?.amount) || 0
  const col = ADJUSTMENT_COLUMN[adjustment?.kind]
  if (!col || !client?.id || !adjustment?.id) throw new Error('invalid adjustment')
  await removeRow(adjustment.id)
  const fresh = await readScalar(client.id, col)
  const before = Number(fresh ?? client[col]) || 0
  try {
    await writeScalar(client.id, { [col]: before - delta })
  } catch (e) {
    await restoreRow(adjustment.id).catch(() => {})
    throw e
  }
  onChanged?.()
  pushUndo?.({
    label: undoLabel,
    undo: async () => {
      await restoreRow(adjustment.id).catch(() => {})
      await writeScalar(client.id, { [col]: before }).catch(() => {})
      onChanged?.()
    },
    redo: async () => {
      await removeRow(adjustment.id).catch(() => {})
      await writeScalar(client.id, { [col]: before - delta }).catch(() => {})
      onChanged?.()
    },
  })
}
