/* ════════════════════════════════════════════════════════════════
   DELETING A CLIENT SUB-STATUS — its clients go somewhere first.
   ════════════════════════════════════════════════════════════════
   The phone deleted a sub-status on one tap and left every client on it
   pointing at a status that no longer exists. Web asks where those clients
   should go (DeleteSubStatusModal) and offers one undo that restores the
   status AND moves exactly those clients back; this is that flow, with the
   writes passed in so it can be tested without a database.

   Clients are moved BY ID, not "everyone on the status": the ids are the
   ones the user was told about, and they are the ones undo has to put back.
   ════════════════════════════════════════════════════════════════ */

export async function deleteSubStatusMovingClients({
  status, ids = [], toId = null, reassign, remove, restore, pushUndo, label, onChanged,
}) {
  if (ids.length) await reassign(ids, toId)
  await remove(status.id)
  pushUndo?.({
    label,
    undo: async () => {
      try { await restore(status.id) } catch { /* keep going */ }
      try { if (ids.length) await reassign(ids, status.id) } catch { /* keep going */ }
      onChanged?.()
    },
    redo: async () => {
      try { if (ids.length) await reassign(ids, toId) } catch { /* keep going */ }
      try { await remove(status.id) } catch { /* keep going */ }
      onChanged?.()
    },
  })
  onChanged?.()
}
