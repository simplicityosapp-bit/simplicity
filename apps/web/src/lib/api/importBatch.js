import { supabase } from '../supabase'

/* ════════════════════════════════════════════════════════════════
   UNDO AN IMPORT — delete exactly what one import wrote.
   ════════════════════════════════════════════════════════════════
   Every row `finalizeOnboardingImport` writes carries that call's
   `import_batch_id` (migration 0116). Undo is therefore a delete per
   table on one indexed column — no name matching, no timestamp windows,
   and no chance of catching a client somebody typed in by hand, because
   a hand-typed row's batch id is NULL and NULL matches nothing.

   TWO PROMISES, and the second is the one that matters:

   1. Only this batch. Never a row from another import, never a row the
      importer did not create.

   2. Never work the user has since done. `updated_at > created_at` means
      somebody edited the row after the import put it there — a phone
      corrected, a price fixed, a status moved. Those are KEPT and
      reported, not deleted. Every one of these tables carries a
      `set_updated_at` BEFORE UPDATE trigger, and the importer only ever
      inserts, so straight after an import the two timestamps are equal
      and everything is removable; the gap only opens when a person
      opens the row.

   Order is FK order, children first. Sessions and payment plans hang off
   clients; installments hang off plans AND off the transactions that pay
   them; transactions hang off clients, projects, categories and recurring
   templates; clients hang off projects and statuses. Deleting a parent
   first would either fail or cascade — and a cascade would take the
   edited children this function exists to protect.

   HARD delete, not `deleted_at`. Trash is for things the user removed and
   might want back; this is the app taking back rows it should not have
   written, and leaving 400 of them in the bin would be its own mess.
   ════════════════════════════════════════════════════════════════ */

/* Children before parents. */
const TABLES = [
  'payment_installments',
  'payment_plans',
  'sessions',
  'transactions',
  'recurring_templates',
  'clients',
  'leads',
  'categories',
  'client_statuses',
  'lead_statuses',
  'projects',
]

/* What an undo would do, without doing it: how many rows this batch still
   owns, and how many of them a person has edited since. Cheap enough to
   run while a confirmation dialog is open, and the numbers it returns are
   the ones that dialog should be quoting. */
export async function previewUndoImport(batchId) {
  if (!batchId) return { removable: 0, kept: 0, byTable: {} }
  const byTable = {}
  let removable = 0
  let kept = 0
  for (const table of TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select('id, created_at, updated_at')
      .eq('import_batch_id', batchId)
    if (error) throw error
    const rows = data || []
    const edited = rows.filter((r) => touched(r)).length
    if (rows.length) byTable[table] = { total: rows.length, edited }
    removable += rows.length - edited
    kept += edited
  }
  return { removable, kept, byTable }
}

/* An imported row nobody has opened since keeps updated_at == created_at.
   Compared as instants, not strings: the two columns can serialise with
   different precision (`…:07Z` vs `…:07.123456Z`) for the very same
   moment, and a string compare would call that an edit. */
function touched(row) {
  const created = Date.parse(row.created_at)
  const updated = Date.parse(row.updated_at)
  if (Number.isNaN(created) || Number.isNaN(updated)) return false
  /* A second of slack: the trigger stamps `now()` per statement, so rows
     written in one import can differ from their own created_at by a few
     hundred ms without anyone having touched them. */
  return updated - created > 1000
}

/* Delete the batch. Returns { removed, kept } — `kept` is the rows left
   standing because they had been edited, which the caller must SAY:
   silently keeping rows the user asked to remove is how an undo button
   stops being trustworthy. */
export async function undoImportBatch(batchId) {
  if (!batchId) throw new Error('undoImportBatch: no batch id')
  let removed = 0
  let kept = 0
  for (const table of TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select('id, created_at, updated_at')
      .eq('import_batch_id', batchId)
    if (error) throw error
    const ids = (data || []).filter((r) => !touched(r)).map((r) => r.id)
    kept += (data || []).length - ids.length
    /* In pages: a long file can leave a few thousand rows in one table,
       and the ids travel in the URL. */
    for (let i = 0; i < ids.length; i += 200) {
      const slice = ids.slice(i, i + 200)
      const { error: delError } = await supabase.from(table).delete().in('id', slice)
      if (delError) throw delError
      removed += slice.length
    }
  }
  return { removed, kept }
}
