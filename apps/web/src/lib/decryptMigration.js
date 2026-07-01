/* ════════════════════════════════════════════════════════════════
   DECRYPT MIGRATION — one-time un-encryption of every previously-encrypted
   field. Field encryption was removed 2026-06 (see docs/security-review-2026-06.md);
   notes / summaries / reflections (and any leftover phone) are now stored
   plaintext at rest.
   ════════════════════════════════════════════════════════════════
   Reads each legacy field RAW, decrypts any value still in "ENC:" form with the
   user's (still-derivable) key, and writes the plaintext back. Generalises the
   earlier phone-only pass over LEGACY_DECRYPT_FIELDS.

   Safety properties (same pattern the earlier phone/field migrations used):
   - Per-user, in the browser — only that user's key decrypts their rows.
   - Guarded writes: each update is conditioned on the column STILL holding the
     exact ciphertext we read (.eq(field, old)), so a concurrent edit is never
     clobbered.
   - Paginated under the PostgREST 1000-row cap.
   - Resumable: throws on any real write error so the caller won't flag it done.
   - Key-stable: bails if the active key changes mid-flight (user switch).
   - Never persists a still-"ENC:" value as plaintext (decryptField returns the
     raw value on failure — we only write when it actually decrypted).
   RLS scopes every query to the current user.
   ════════════════════════════════════════════════════════════════ */
import { supabase } from './supabase'
import { decryptField, isEncrypted } from './crypto'
import { getActiveKey, LEGACY_DECRYPT_FIELDS } from './fieldCrypto'

const PAGE = 500  // rows per read page (under the default PostgREST cap)
const CHUNK = 12  // concurrent guarded updates per batch

export async function runDecryptMigration() {
  const key = getActiveKey()
  if (!key) return { ran: false, updated: 0 }

  let updated = 0
  for (const [table, fields] of Object.entries(LEGACY_DECRYPT_FIELDS)) {
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

      // One guarded update per field that still holds ciphertext.
      const ops = []
      for (const row of rows) {
        for (const f of fields) {
          const v = row[f]
          if (v != null && v !== '' && isEncrypted(v)) {
            const plain = await decryptField(v, key)
            if (!isEncrypted(plain)) ops.push({ id: row.id, f, plain, old: v })
          }
        }
      }
      for (let i = 0; i < ops.length; i += CHUNK) {
        const batch = ops.slice(i, i + CHUNK)
        const results = await Promise.all(batch.map(({ id, f, plain, old }) =>
          supabase.from(table).update({ [f]: plain }).eq('id', id).eq(f, old)
            .then(({ error: e }) => e)))
        const firstErr = results.find(Boolean)
        if (firstErr) throw new Error(`decrypt write failed (${table}): ${firstErr.message}`)
        updated += batch.length
      }

      if (rows.length < PAGE) break
    }
  }
  return { ran: true, updated }
}
