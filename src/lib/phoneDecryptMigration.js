/* ════════════════════════════════════════════════════════════════
   PHONE DECRYPT MIGRATION — one-time un-encryption of clients.phone.
   ════════════════════════════════════════════════════════════════
   phone was previously encrypted at rest; it is now stored plaintext so
   invoicing integrations (Green Invoice / SUMIT) can read it. This pass
   reads phone RAW, decrypts any value still in "ENC:" form with the user's
   key, and writes the plaintext back.

   Mirrors encryptionMigration.js (the reverse direction):
   - Per-user, in the browser — only that user's key can decrypt their rows.
   - Guarded writes: each update is conditioned on the column STILL holding the
     exact ciphertext we read (.eq('phone', old)), so a concurrent edit is
     never clobbered.
   - Paginated under the PostgREST 1000-row cap.
   - Resumable: throws on any real write error so the caller won't flag it done.
   - Key-stable: bails if the active key changes mid-flight (user switch).
   RLS scopes every query to the current user.
   ════════════════════════════════════════════════════════════════ */
import { supabase } from './supabase'
import { decryptField, isEncrypted } from './crypto'
import { getActiveKey } from './fieldCrypto'

const PAGE = 500   // rows per read page (under the default PostgREST cap)
const CHUNK = 12   // concurrent guarded updates per batch

export async function runPhoneDecryptMigration() {
  const key = getActiveKey()
  if (!key) return { ran: false, updated: 0 }

  let updated = 0
  for (let from = 0; ; from += PAGE) {
    if (getActiveKey() !== key) return { ran: false, updated } // user switched — abort

    const { data, error } = await supabase
      .from('clients').select('id, phone')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    if (!rows.length) break

    // One guarded update per row that still holds ciphertext.
    const ops = []
    for (const row of rows) {
      const v = row.phone
      if (v != null && v !== '' && isEncrypted(v)) {
        const plain = await decryptField(v, key)
        // Only write if it actually decrypted (decryptField returns the raw
        // value on failure — never persist a still-"ENC:" value as plaintext).
        if (!isEncrypted(plain)) ops.push({ id: row.id, plain, old: v })
      }
    }
    for (let i = 0; i < ops.length; i += CHUNK) {
      const batch = ops.slice(i, i + CHUNK)
      const results = await Promise.all(batch.map(({ id, plain, old }) =>
        supabase.from('clients').update({ phone: plain }).eq('id', id).eq('phone', old)
          .then(({ error: e }) => e)))
      const firstErr = results.find(Boolean)
      if (firstErr) throw new Error(`phone decrypt write failed: ${firstErr.message}`)
      updated += batch.length
    }

    if (rows.length < PAGE) break
  }
  return { ran: true, updated }
}
