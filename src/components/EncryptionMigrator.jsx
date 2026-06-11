import { useEffect, useRef } from 'react'
import { useCrypto } from '../context/CryptoContext'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { runEncryptionMigration } from '../lib/encryptionMigration'
import { runPhoneDecryptMigration } from '../lib/phoneDecryptMigration'

/* ════════════════════════════════════════════════════════════════
   One-time, per-user backfills that run once the encryption key is
   ready, each flagged in prefs so it never repeats. Both run in the
   BACKGROUND — the UI is fully usable. Idempotent + resumable: on
   failure the flag isn't set, so it retries next load and skips rows
   already done. update() deep-merges + serialises writes, so the two
   flags never clobber each other. Renders nothing.
   ════════════════════════════════════════════════════════════════ */
export default function EncryptionMigrator() {
  const { isReady } = useCrypto()
  const { prefs, update } = useUserPreferences()
  const encRef = useRef(false)
  const phoneRef = useRef(false)

  /* Encrypt backfill — encrypt any existing plaintext in ENCRYPTED_FIELDS. */
  useEffect(() => {
    if (!isReady || !prefs || encRef.current) return
    if (prefs.encryption?.migrated_v1) return
    encRef.current = true
    runEncryptionMigration()
      .then(() => update({ encryption: { migrated_v1: true, at: new Date().toISOString() } }))
      .catch(() => { encRef.current = false }) // allow retry on next load
  }, [isReady, prefs, update])

  /* Phone DEcrypt backfill — phone is no longer encrypted at rest; clear any
     "ENC:" left from the earlier encryption so it's plaintext for invoicing
     integrations. No-op (0 rows) for users who never had encrypted phones. */
  useEffect(() => {
    if (!isReady || !prefs || phoneRef.current) return
    if (prefs.encryption?.phone_decrypted_v1) return
    phoneRef.current = true
    runPhoneDecryptMigration()
      .then(() => update({ encryption: { phone_decrypted_v1: true, phoneAt: new Date().toISOString() } }))
      .catch(() => { phoneRef.current = false }) // allow retry on next load
  }, [isReady, prefs, update])

  return null
}
