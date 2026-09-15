/* ════════════════════════════════════════════════════════════════
   LEGAL CONSENT — web glue.
   ════════════════════════════════════════════════════════════════
   The versions, their changelog and the consent helpers live in
   @simplicity/core/domain/legal, which the phone reads too — so a version
   bump re-prompts in both apps from one edit. Any policy text change must
   still bump its version there.

   What stays here is web's own: the pending-consent stash, which exists
   because Google OAuth leaves the page.
   ════════════════════════════════════════════════════════════════ */
export {
  PRIVACY_VERSION,
  DPA_VERSION,
  TERMS_VERSION,
  buildConsent,
  buildReacceptance,
  needsReacceptance,
  marketingConsent,
  consentRowsFromMetadata,
} from '@simplicity/core'

/* ── Pending-consent stash (Google signup) ──────────────────────────
   OAuth redirects away from the signup form, so we stash the consent the
   user gave (checkboxes) before redirecting, and write it to user_metadata
   on the authenticated return. */
export const PENDING_CONSENT_KEY = 'simplicity_pending_consent'

export function stashPendingConsent(consent) {
  try { window.localStorage.setItem(PENDING_CONSENT_KEY, JSON.stringify(consent)) } catch { /* ignore */ }
}
export function readPendingConsent() {
  try {
    const raw = window.localStorage.getItem(PENDING_CONSENT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
export function clearPendingConsent() {
  try { window.localStorage.removeItem(PENDING_CONSENT_KEY) } catch { /* ignore */ }
}
