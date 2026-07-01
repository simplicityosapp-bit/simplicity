import { useEffect, useRef } from 'react'
import { useCrypto } from '../context/CryptoContext'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { runDecryptMigration } from '../lib/decryptMigration'

/* ════════════════════════════════════════════════════════════════
   One-time, per-user DECRYPT backfill. Field encryption was removed
   (2026-06; see docs/security-review-2026-06.md) — this clears any
   remaining "ENC:" values to plaintext once the key is ready, flagged in
   prefs so it runs once. Runs in the BACKGROUND (UI fully usable),
   idempotent + resumable: on failure the flag isn't set, so it retries next
   load and skips rows already done. Renders nothing.

   Phase-2 cleanup (after the fleet has migrated): delete this component, the
   decrypt migration, and the crypto code (CryptoProvider/CryptoGate/crypto.js/
   fieldCrypto + the legacy migration files).
   ════════════════════════════════════════════════════════════════ */
export default function EncryptionMigrator() {
  const { isReady } = useCrypto()
  const { prefs, update } = useUserPreferences()
  const ran = useRef(false)

  useEffect(() => {
    if (!isReady || !prefs || ran.current) return
    if (prefs.encryption?.legacy_decrypted_v1) return
    ran.current = true
    runDecryptMigration()
      // Only flag complete on a run that ACTUALLY finished (res.ran). A
      // mid-flight key switch (user change) resolves with {ran:false} without
      // throwing — don't stamp the flag then, or leftover ENC: rows would never
      // get a second pass.
      .then((res) => {
        if (res?.ran) return update({ encryption: { legacy_decrypted_v1: true, at: new Date().toISOString() } })
        ran.current = false // incomplete — retry on next load
      })
      .catch(() => { ran.current = false }) // allow retry on next load
  }, [isReady, prefs, update])

  return null
}
