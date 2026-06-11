import { useEffect, useRef } from 'react'
import { useAuth } from '../auth/AuthContext'
import { consentRowsFromMetadata } from '../lib/legal'
import { recordConsent } from '../lib/api/consentLog'

/* ════════════════════════════════════════════════════════════════
   Mirrors the user's consent (from auth user_metadata) into the durable
   append-only user_consent table — once per load, idempotently. One place
   covers every path: email signup, re-acceptance, AND existing users who
   consented before the table existed (backfill). The Google-OAuth path is
   captured even more directly in App's ConsentGate (from the pending stash,
   before the fragile metadata write). Self-healing: a failed write retries on
   the next load. Renders nothing.
   ════════════════════════════════════════════════════════════════ */
export default function ConsentSync() {
  const { user } = useAuth()
  const done = useRef(false)

  useEffect(() => {
    if (!user || done.current) return
    const rows = consentRowsFromMetadata(user.user_metadata)
    if (!rows.length) { done.current = true; return }
    done.current = true
    recordConsent(rows).catch(() => { done.current = false }) // retry next load on failure
  }, [user])

  return null
}
