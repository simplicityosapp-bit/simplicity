/* ════════════════════════════════════════════════════════════════
   RECURRING TRANSACTIONS — deleting one occurrence of a live rule.
   ════════════════════════════════════════════════════════════════
   A recurring transaction is not an independent record: it is the OUTPUT of
   a template, one row per (recurring_id, date) slot. Three things made
   "delete" a no-op on such a row:

     · listTransactions filters `deleted_at is null`, so the row leaves the
       array the generator reads;
     · generateRecurringTransactions builds its dedup keys from exactly that
       array, so the slot reads as never filled;
     · the DB's unique guards are PARTIAL (`WHERE deleted_at IS NULL`), so the
       re-insert is not rejected either.

   The row came straight back on the next mount of home or finance — observed
   in production as four rows on one slot, the last regenerated thirteen
   seconds after the third delete.

   Feeding the deleted rows back to the generator does not hold: purge_trash
   hard-deletes transactions after 30 days, so the tombstone expires and the
   occurrence returns a month later.

   So a delete only sticks if the rule stops owning the slot. Owner decision
   (25/08): deleting an occurrence of a LIVE template pauses that template,
   behind a warning that also explains what «דילוג» does — skipping and
   deleting stay deliberately separate actions, and the warning is where the
   user picks between them knowingly.

   Pausing, not deleting, the template: a paused rule still shows on the
   finance screen with its resume toggle, so the user can turn it back on.
   ════════════════════════════════════════════════════════════════ */

import { pushUndo } from './undo'

/* The template that still owns this transaction's slot — i.e. the one that
   would refill it — or null when nothing would. A paused or soft-deleted
   template generates nothing, so a row left behind by one is an ordinary
   transaction and deletes like any other. */
export function owningTemplate(tx, templates) {
  if (!tx?.recurring_id) return null
  return (templates || []).find(
    (r) => r.id === tx.recurring_id && !r.deleted_at && r.active,
  ) || null
}

/* Delete a transaction, pausing the rule behind it when there is one.
   Falls through to the plain delete (with its own undo) for every ordinary
   transaction, so callers can route ALL their deletes through this. */
export async function removeTransactionAndRule({
  tx, templates, removeTransaction, putBackTransaction, updateRecurring, label,
}) {
  if (!tx?.id) return
  const tpl = owningTemplate(tx, templates)
  if (!tpl) return removeTransaction(tx.id)

  /* silent: pushUndo is single-level, so the one undo registered below has to
     cover both halves — otherwise the transaction's own undo would win and
     leave the template paused with nothing explaining why. */
  await removeTransaction(tx.id, { silent: true })
  await updateRecurring(tpl.id, { active: false })

  pushUndo({
    label,
    undo: async () => {
      await putBackTransaction(tx.id).catch(() => {})
      await updateRecurring(tpl.id, { active: true }).catch(() => {})
    },
    redo: async () => {
      await removeTransaction(tx.id, { silent: true }).catch(() => {})
      await updateRecurring(tpl.id, { active: false }).catch(() => {})
    },
  })
}
