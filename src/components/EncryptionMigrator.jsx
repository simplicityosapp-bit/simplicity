import { useEffect, useRef } from 'react'
import { useCrypto } from '../context/CryptoContext'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { runEncryptionMigration } from '../lib/encryptionMigration'

/* ════════════════════════════════════════════════════════════════
   One-time, per-user: once the encryption key is ready, encrypt any
   existing plaintext in the encrypted fields, then flag it done so it
   never runs again. Runs in the BACKGROUND — the UI is fully usable while
   it works. Idempotent + resumable: on failure the flag isn't set, so it
   retries on the next load and skips rows already encrypted. Renders nothing.
   ════════════════════════════════════════════════════════════════ */
export default function EncryptionMigrator() {
  const { isReady } = useCrypto()
  const { prefs, update } = useUserPreferences()
  const startedRef = useRef(false)

  useEffect(() => {
    if (!isReady || !prefs || startedRef.current) return
    if (prefs.encryption?.migrated_v1) return
    startedRef.current = true
    runEncryptionMigration()
      .then(() => update({ encryption: { migrated_v1: true, at: new Date().toISOString() } }))
      .catch(() => { startedRef.current = false }) // allow retry on next load
  }, [isReady, prefs, update])

  return null
}
