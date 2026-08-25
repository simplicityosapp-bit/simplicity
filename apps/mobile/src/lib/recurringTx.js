/* ════════════════════════════════════════════════════════════════
   RECURRING TRANSACTIONS — deleting one occurrence of a live rule.
   ════════════════════════════════════════════════════════════════
   Mirrors apps/web/src/lib/recurringTx.js; keep the two in step. The Alert
   lives here too, unlike the web (which has a ConfirmModal per list), because
   both mobile surfaces that delete a transaction — the finance screen and the
   client drawer — would otherwise each hand-roll the same three-button dialog.

   A recurring transaction is the OUTPUT of a template, one row per
   (recurring_id, date) slot. Soft-deleting it frees that slot: the row leaves
   the deleted_at-filtered list the generator dedups against, and the DB's
   unique guards are partial (`WHERE deleted_at IS NULL`) so the re-insert is
   not rejected either.

   This app never runs the generator, so nothing resurrects while you stay on
   the phone. It resurrects on the next web load instead, which is worse — the
   delete looks like it worked and undoes itself somewhere else.

   Owner decision (25/08): deleting an occurrence of a LIVE template pauses
   that template, behind a warning that also explains what the skip action
   does — skipping and deleting stay separate on purpose, and the warning is
   where the choice gets made knowingly. Pausing rather than deleting the rule:
   the finance screen's recurring section shows a paused rule with «מושהה» and
   a resume button, so it stays visible and reversible.
   ════════════════════════════════════════════════════════════════ */

import { Alert } from 'react-native'
import { isr } from '@simplicity/core'
import i18n from './i18n'
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

/* Delete a transaction, pausing the rule behind it when there is one. Falls
   through to the plain delete for every ordinary transaction. */
export async function removeTransactionAndRule({
  tx, templates, deleteTransaction, restoreTransaction, updateRecurring,
}) {
  if (!tx?.id) return
  const tpl = owningTemplate(tx, templates)
  if (!tpl) return deleteTransaction(tx.id)

  await deleteTransaction(tx.id)
  await updateRecurring(tpl.id, { active: false })

  /* One undo for both halves — pushUndo is single-level, so registering two
     would strand whichever lost. */
  pushUndo({
    label: i18n.t('finance:deleteTx.undoRule', { defaultValue: 'התנועה נמחקה והתבנית הושהתה' }),
    undo: async () => {
      await restoreTransaction(tx.id).catch(() => {})
      await updateRecurring(tpl.id, { active: true }).catch(() => {})
    },
    redo: async () => {
      await deleteTransaction(tx.id).catch(() => {})
      await updateRecurring(tpl.id, { active: false }).catch(() => {})
    },
  })
}

/* Ask, then delete. Deleting money asks first everywhere else in the app; a
   bare trash tap on this platform was the last place it didn't. `afterDelete`
   lets a caller close the sheet it was pressed from. */
export function confirmRemoveTransaction({
  tx, templates, deleteTransaction, restoreTransaction, updateRecurring, afterDelete,
}) {
  if (!tx?.id) return
  const tpl = owningTemplate(tx, templates)
  const vars = {
    desc: tx.desc || i18n.t('finance:tx.noDesc', { defaultValue: 'ללא תיאור' }),
    amount: isr(tx.amount),
  }
  /* defaultValue on every key, like the rest of this app: the whole `he` bundle
     ships with the engine so these do resolve, but a raw "finance:deleteTx…"
     in an Alert title would be an ugly way to find out otherwise. */
  Alert.alert(
    tpl
      ? i18n.t('finance:deleteTx.recurringTitle', { defaultValue: 'מחיקת תנועה חוזרת' })
      : i18n.t('finance:deleteTx.title', { defaultValue: 'מחיקת תנועה' }),
    tpl
      ? i18n.t('finance:deleteTx.recurringMessage', { ...vars, defaultValue: 'התנועה נוצרה מתבנית חוזרת. מחיקה תשהה גם את התבנית.' })
      : i18n.t('finance:deleteTx.message', { ...vars, defaultValue: 'למחוק את התנועה?' }),
    [
      { text: i18n.t('modalsData:common.cancel', { defaultValue: 'ביטול' }), style: 'cancel' },
      {
        text: tpl
          ? i18n.t('finance:deleteTx.recurringConfirm', { defaultValue: 'מחק והשהה' })
          : i18n.t('finance:deleteTx.confirm', { defaultValue: 'מחק' }),
        style: 'destructive',
        onPress: () => {
          removeTransactionAndRule({ tx, templates, deleteTransaction, restoreTransaction, updateRecurring })
            .catch(() => {})
          afterDelete?.()
        },
      },
    ],
  )
}
