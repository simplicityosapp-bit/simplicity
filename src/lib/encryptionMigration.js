/* ════════════════════════════════════════════════════════════════
   ENCRYPTION MIGRATION — one-time backfill of existing plaintext data.
   ════════════════════════════════════════════════════════════════
   When field encryption is first enabled, rows written before it are still
   plaintext at rest. This pass reads the encrypted columns RAW (bypassing
   the api's auto-decrypt so it can see what's actually stored), encrypts any
   value still in plaintext, and writes it back.

   Runs per-user in the browser (only that user's key can encrypt their rows).
   Safety properties:
   - Guarded writes: each update is conditioned on the column STILL holding the
     exact plaintext we read (.eq(field, old)), so a concurrent user edit is
     never clobbered — if they just saved a new value, our write no-ops.
   - Paginated: reads in pages (PostgREST caps a plain select at ~1000 rows),
     so users with lots of data are fully covered.
   - Resumable: throws on any real write error, so the caller won't flag it
     done; the next load re-runs and skips rows already encrypted.
   - Key-stable: captures the key once and bails if the active key changes
     mid-flight (user switch).
   RLS scopes every query to the current user.
   ════════════════════════════════════════════════════════════════ */
import { supabase } from './supabase'
import { encryptField, isEncrypted } from './crypto'
import { getActiveKey, ENCRYPTED_FIELDS } from './fieldCrypto'

const PAGE = 500  // rows per read page (under the default PostgREST cap)
const CHUNK = 12  // concurrent guarded updates per batch

export async function runEncryptionMigration() {
  const key = getActiveKey()
  if (!key) return { ran: false, updated: 0 }

  let updated = 0
  for (const [table, fields] of Object.entries(ENCRYPTED_FIELDS)) {
    const select = ['id', ...fields].join(', ')
    for (let from = 0; ; from += PAGE) {
      if (getActiveKey() !== key) return { ran: false, updated } // user switched — abort

      const { data, error } = await supabase
        .from(table).select(select)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw error
      const rows = data ?? []
      if (!rows.length) break

      // One guarded update per plaintext field.
      const ops = []
      for (const row of rows) {
        for (const f of fields) {
          const v = row[f]
          if (v != null && v !== '' && !isEncrypted(v)) {
            ops.push({ id: row.id, f, enc: await encryptField(v, key), old: v })
          }
        }
      }
      for (let i = 0; i < ops.length; i += CHUNK) {
        const batch = ops.slice(i, i + CHUNK)
        const results = await Promise.all(batch.map(({ id, f, enc, old }) =>
          supabase.from(table).update({ [f]: enc }).eq('id', id).eq(f, old)
            .then(({ error: e }) => e)))
        const firstErr = results.find(Boolean)
        if (firstErr) throw new Error(`backfill write failed (${table}): ${firstErr.message}`)
        updated += batch.length
      }

      if (rows.length < PAGE) break
    }
  }
  return { ran: true, updated }
}
