import { useEffect, useRef } from 'react'
import { useAuth } from '../auth/AuthContext'
import { consentRowsFromMetadata } from '../lib/legal'
import { readCookieConsent, cookieConsentRow } from '../lib/cookieConsent'
import { recordConsent } from '../lib/api/consentLog'

/* ════════════════════════════════════════════════════════════════
   Mirrors the user's consent into the durable append-only user_consent
   table — once per load, idempotently. Two sources:
   • Legal consent from auth user_metadata (privacy / dpa / terms / marketing)
     — covers email signup, re-acceptance, AND existing users who consented
     before the table existed (backfill). The Google-OAuth path is captured
     even more directly in App's ConsentGate (from the pending stash).
   • The cookie-banner choice from localStorage — a visitor decides on the
     public pages while logged out, and that choice (accept / reject) is
     recorded here on the authenticated load.
   accepted_at is stable per acceptance, so re-recording is a no-op. Self-
   healing: a failed write retries on the next load. Renders nothing.
   ════════════════════════════════════════════════════════════════ */
export default function ConsentSync() {
  const { user } = useAuth()
  const done = useRef(false)

  useEffect(() => {
    if (!user || done.current) return
    const rows = consentRowsFromMetadata(user.user_metadata)
    const cookieRow = cookieConsentRow(readCookieConsent())
    if (cookieRow) rows.push(cookieRow)
    if (!rows.length) { done.current = true; return }
    done.current = true
    recordConsent(rows).catch(() => { done.current = false }) // retry next load on failure
  }, [user])

  return null
}
