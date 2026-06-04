import { pushUndo } from './undo'

/* ════════════════════════════════════════════════════════════════
   UNDO ACTION BUILDERS — reused by the entity hooks.
   ════════════════════════════════════════════════════════════════ */

/* Register a single-level undo for a soft-delete performed through a
   React-Query-backed hook.
     • undo  → optimistically re-inserts the captured row, calls the
               server restore, then invalidates so list ordering is
               reconciled from the source of truth.
     • redo  → optimistically removes it again and re-deletes.
   Pass the row captured BEFORE the optimistic delete (so we can put it
   back) plus the query key, the API restore fn, and the API delete fn. */
export function registerDeleteUndo({ qc, key, row, label, restoreFn, deleteFn }) {
  if (!row) return
  pushUndo({
    label,
    undo: async () => {
      qc.setQueryData(key, (prev) => [row, ...(prev ?? []).filter((r) => r.id !== row.id)])
      try { await restoreFn(row.id) } finally { qc.invalidateQueries({ queryKey: key }) }
    },
    redo: async () => {
      qc.setQueryData(key, (prev) => (prev ?? []).filter((r) => r.id !== row.id))
      try { await deleteFn(row.id) } finally { qc.invalidateQueries({ queryKey: key }) }
    },
  })
}
