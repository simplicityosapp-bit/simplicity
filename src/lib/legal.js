/* ════════════════════════════════════════════════════════════════
   LEGAL CONSENT — versions + helpers.
   ════════════════════════════════════════════════════════════════
   Consent is stored in auth.users user_metadata: written at signup via
   supabase.auth.signUp({ options: { data } }), and updated on re-acceptance
   via supabase.auth.updateUser({ data }). No DB table / migration — there is
   no app-owned users table, and user_metadata is the only store writable at
   the signup moment (before the email is confirmed / a session exists).

   Shape stored in user_metadata:
     privacy_accepted_at, privacy_version, dpa_accepted_at, dpa_version,
     marketing_consent (bool), marketing_consent_at (iso | null)
   ════════════════════════════════════════════════════════════════ */

export const PRIVACY_VERSION = '1.0'
export const DPA_VERSION = '1.0'

/* The consent block written at signup / first acceptance. */
export function buildConsent({ marketing = false } = {}) {
  const now = new Date().toISOString()
  return {
    privacy_accepted_at: now,
    privacy_version: PRIVACY_VERSION,
    dpa_accepted_at: now,
    dpa_version: DPA_VERSION,
    marketing_consent: !!marketing,
    marketing_consent_at: marketing ? now : null,
  }
}

/* Re-acceptance block (policy/DPA only — leaves marketing_consent untouched). */
export function buildReacceptance() {
  const now = new Date().toISOString()
  return {
    privacy_accepted_at: now,
    privacy_version: PRIVACY_VERSION,
    dpa_accepted_at: now,
    dpa_version: DPA_VERSION,
  }
}

/* True when the user must (re)accept: never accepted (existing beta users
   have no recorded consent) OR accepted an older privacy version. */
export function needsReacceptance(user) {
  return user?.user_metadata?.privacy_version !== PRIVACY_VERSION
}

export function marketingConsent(user) {
  return !!user?.user_metadata?.marketing_consent
}

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
