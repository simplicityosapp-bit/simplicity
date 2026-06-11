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

/* Columns encrypted per table. NAMES stay plaintext on purpose, so server-side
   calendar matching + sort + search keep working. */
export const ENCRYPTED_FIELDS = {
  clients: ['notes'],
  sessions: ['notes', 'summary'],
  moon_snapshots: ['reflection'],
}

/* Fields being UN-encrypted: decrypted on read but NOT encrypted on write.
   clients.phone was encrypted; it is now stored plaintext (so invoicing
   integrations can read it), but rows written before the change may still
   hold "ENC:" at rest — keep decrypting it on read until the one-time
   phoneDecryptMigration has cleared every row. Remove this entry once the
   backfill is confirmed complete for all users. */
export const LEGACY_DECRYPT_FIELDS = {
  clients: ['phone'],
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
