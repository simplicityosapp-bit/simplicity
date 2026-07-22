/* ════════════════════════════════════════════════════════════════
   FIELD ENCRYPTION (LEGACY, READ PATH ONLY) — AES-256-GCM via Web Crypto.
   ════════════════════════════════════════════════════════════════
   NOTHING IS ENCRYPTED ANYMORE. Field encryption was removed 2026-06 (see
   docs/security-review-2026-06.md); notes / summaries / reflections / phone
   are stored as PLAINTEXT at rest, like names and email. This module survives
   only to DECRYPT values still written in the old format — the api read path
   (lib/fieldCrypto.js, LEGACY_DECRYPT_FIELDS) and the one-time backfill
   (lib/decryptMigration.js). encryptField() below is kept for symmetry and has
   NO live callers: its only caller, encryptRow(), gates on ENCRYPTED_FIELDS,
   which is empty. The key is still derived per-user and lives ONLY in memory
   (see context/CryptoContext.jsx) — never localStorage, sessionStorage, the
   DB, or any persistent store.

   On-disk format:  "ENC:" + base64( IV[12 bytes] ‖ ciphertext+tag )
   Any value NOT starting with "ENC:" is returned as-is, so plaintext — the
   norm now — passes through untouched.

   No external libraries — Web Crypto only. encrypt/decrypt are async
   (the Web Crypto contract), so callers must await them.

   WHY IT WAS REMOVED (finding OD-1): the key is PBKDF2 over the user id + a
   salt that ships in the public bundle, so BOTH inputs are known to anyone
   holding a DB dump — `user_id` sits in plaintext on the very row whose fields
   are "encrypted". Such an attacker derives every user's key offline and reads
   100% of the ciphertext, which is exactly the scenario the feature claimed to
   defend. Do NOT reintroduce this scheme. At rest the data is protected by RLS
   alone (plus HTTPS/TLS in transit). docs/ENCRYPTION_PLAN.md describes the
   original design and is superseded.
   ════════════════════════════════════════════════════════════════ */

const ENC_PREFIX = 'ENC:'
/* Fixed application salt — combined with the per-user id in PBKDF2 so each
   user derives a distinct key. Versioned so we can rotate the scheme later. */
const APP_SALT = 'simplicity::field-encryption::v1::a7f3c1e9b2d84056'
const PBKDF2_ITERATIONS = 100_000
const IV_BYTES = 12

const te = new TextEncoder()
const td = new TextDecoder()

function bytesToB64(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}
function b64ToBytes(b64) {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/* Derive the per-user AES-GCM key. Non-extractable — it can encrypt/decrypt
   but cannot be read back out of the CryptoKey. */
export async function deriveKey(userId) {
  if (!userId) throw new Error('deriveKey: userId is required')
  const baseKey = await crypto.subtle.importKey(
    'raw', te.encode(String(userId)), 'PBKDF2', false, ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: te.encode(APP_SALT), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX)
}

/* Encrypt a single field. null/undefined and '' pass through unchanged
   (nothing to hide, and it keeps "empty" semantics intact). Already-encrypted
   values pass through too, so re-saving a row never double-encrypts. */
export async function encryptField(plaintext, key) {
  if (plaintext == null) return plaintext
  const text = String(plaintext)
  if (text === '' || text.startsWith(ENC_PREFIX)) return text
  if (!key) throw new Error('encryptField: key not ready')
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(text)),
  )
  const packed = new Uint8Array(iv.length + cipher.length)
  packed.set(iv, 0)
  packed.set(cipher, iv.length)
  return ENC_PREFIX + bytesToB64(packed)
}

/* Decrypt a single field. Plaintext (no prefix) is returned as-is (legacy
   data). On ANY failure — missing key, corrupt payload — the raw value is
   returned rather than throwing, so a bad row never crashes a screen. */
export async function decryptField(value, key) {
  if (value == null) return value
  const text = String(value)
  if (!text.startsWith(ENC_PREFIX)) return value
  if (!key) return value
  try {
    const packed = b64ToBytes(text.slice(ENC_PREFIX.length))
    const iv = packed.slice(0, IV_BYTES)
    const cipher = packed.slice(IV_BYTES)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher)
    return td.decode(plain)
  } catch (e) {
    /* Keep the graceful behaviour (return the raw value so a bad row never
       crashes a screen) but make a GENUINE decrypt failure observable — a
       wrong/cleared key, corrupt payload or GCM auth-tag mismatch would
       otherwise surface only as an opaque "ENC:…" blob with no signal. We log
       the error type ONLY, never the value/plaintext. A spike here means
       decryption is failing across the fleet. */
    console.warn('[crypto] decryptField failed:', e?.name || 'error')
    return value
  }
}
