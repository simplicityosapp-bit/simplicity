/* ════════════════════════════════════════════════════════════════
   FIELD CRYPTO — the api-layer choke point for field encryption.
   ════════════════════════════════════════════════════════════════
   ENCRYPTED_FIELDS lists which columns are encrypted per table. The api
   modules call encryptRow() before writing and decryptRow()/decryptRows()
   after reading, so ciphertext exists ONLY in the database — every caller
   (hooks, CSV import, CSV/XLSX export) sees plaintext transparently.

   The active key is published here by CryptoContext on login (setActiveKey)
   and cleared on logout. It is the SAME CryptoKey held in React context,
   mirrored to this plain-JS module so the api layer can reach it. Still
   memory-only; never persisted. See docs/ENCRYPTION_PLAN.md.
   ════════════════════════════════════════════════════════════════ */
import { encryptField, decryptField } from './crypto'

/* Field encryption was REMOVED 2026-06 (see docs/security-review-2026-06.md):
   notes / summaries / reflections are now stored plaintext at rest, like names,
   phone and email. NOTHING is encrypted on write anymore — this map is empty so
   encryptRow() is a no-op. */
export const ENCRYPTED_FIELDS = {}

/* Fields that may STILL hold legacy "ENC:" ciphertext at rest until the
   one-time per-user decrypt backfill (lib/decryptMigration.js) rewrites them as
   plaintext. They are decrypted transparently on read and never re-encrypted on
   write. The key is still derivable (PBKDF2 over user id + bundled salt), so the
   backfill can read them. Remove this map + the crypto code in the Phase-2
   cleanup once the fleet has fully migrated. */
export const LEGACY_DECRYPT_FIELDS = {
  clients: ['notes', 'phone'],
  sessions: ['notes', 'summary'],
  moon_snapshots: ['reflection'],
}

let activeKey = null
export function setActiveKey(key) { activeKey = key }
export function clearActiveKey() { activeKey = null }
export function getActiveKey() { return activeKey }

/* Encrypt the configured fields present on a row before it goes to the DB.
   A patch only carries the fields being changed, so only those are touched. */
export async function encryptRow(table, row) {
  const fields = ENCRYPTED_FIELDS[table]
  if (!row || !fields) return row
  const out = { ...row }
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(out, f)) out[f] = await encryptField(out[f], activeKey)
  }
  return out
}

/* Decrypt the configured fields on a row coming back from the DB. Includes the
   LEGACY_DECRYPT_FIELDS (being un-encrypted) so any not-yet-backfilled "ENC:"
   value still reads as plaintext; decryptField is a no-op on already-plaintext. */
export async function decryptRow(table, row) {
  const fields = [...(ENCRYPTED_FIELDS[table] || []), ...(LEGACY_DECRYPT_FIELDS[table] || [])]
  if (!row || !fields.length) return row
  const out = { ...row }
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(out, f)) out[f] = await decryptField(out[f], activeKey)
  }
  return out
}

export async function decryptRows(table, rows) {
  if (!Array.isArray(rows)) return rows
  return Promise.all(rows.map((r) => decryptRow(table, r)))
}
