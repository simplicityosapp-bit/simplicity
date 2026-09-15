/* ════════════════════════════════════════════════════════════════
   AN INVESTMENT AND ITS EXPENSE are one record in two tables.
   ════════════════════════════════════════════════════════════════
   Recording "השקעתי" on web writes an investments row AND the expense it
   paid for (investments.transaction_id). Web deletes and restores the two
   together. The phone had no idea the pair existed: deleting that expense
   from the finance list, the edit form or the client drawer removed the
   transaction and left the investment behind, so the widget went on
   counting money set aside with no outgoing to show for it.

   Both helpers are best-effort, like the other follow-up writes in these
   hooks: the transaction write has already landed, and a missing link
   write leaves exactly the state that existed before this file.
   ════════════════════════════════════════════════════════════════ */

export async function softDeleteLinkedInvestments(client, transactionId) {
  if (!transactionId) return
  try {
    await client.from('investments').update({ deleted_at: new Date().toISOString() })
      .eq('transaction_id', transactionId).is('deleted_at', null)
  } catch { /* see above */ }
}

export async function restoreLinkedInvestments(client, transactionId) {
  if (!transactionId) return
  try {
    await client.from('investments').update({ deleted_at: null })
      .eq('transaction_id', transactionId).not('deleted_at', 'is', null)
  } catch { /* see above */ }
}
