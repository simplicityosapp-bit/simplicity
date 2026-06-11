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
     terms_accepted_at, terms_version,
     marketing_consent (bool), marketing_consent_at (iso | null)
   ════════════════════════════════════════════════════════════════ */

export const PRIVACY_VERSION = '1.0'
export const DPA_VERSION = '1.0'
export const TERMS_VERSION = '1.0'

/* The consent block written at signup / first acceptance. */
export function buildConsent({ marketing = false } = {}) {
  const now = new Date().toISOString()
  return {
    privacy_accepted_at: now,
    privacy_version: PRIVACY_VERSION,
    dpa_accepted_at: now,
    dpa_version: DPA_VERSION,
    terms_accepted_at: now,
    terms_version: TERMS_VERSION,
    marketing_consent: !!marketing,
    marketing_consent_at: marketing ? now : null,
  }
}

/* Re-acceptance block (privacy/DPA/terms — leaves marketing_consent untouched). */
export function buildReacceptance() {
  const now = new Date().toISOString()
  return {
    privacy_accepted_at: now,
    privacy_version: PRIVACY_VERSION,
    dpa_accepted_at: now,
    dpa_version: DPA_VERSION,
    terms_accepted_at: now,
    terms_version: TERMS_VERSION,
  }
}

/* True when the user must (re)accept: never accepted (existing beta users
   have no recorded consent), accepted an older privacy version, OR has no
   terms acceptance yet / an older terms version (terms shipped after privacy). */
export function needsReacceptance(user) {
  const md = user?.user_metadata
  return md?.privacy_version !== PRIVACY_VERSION || md?.terms_version !== TERMS_VERSION
}

export function marketingConsent(user) {
  return !!user?.user_metadata?.marketing_consent
}

/* Derive the durable user_consent rows from a consent block (user_metadata OR
   the pending-stash object — same shape). Records the privacy + DPA acceptances
   and the marketing choice (opt-in OR opt-out) at the moment it was made.
   `accepted_at` is the dedup key, so re-deriving + re-recording is idempotent. */
export function consentRowsFromMetadata(md, source = 'backfill') {
  if (!md) return []
  const rows = []
  if (md.privacy_version && md.privacy_accepted_at) {
    rows.push({ kind: 'privacy', version: md.privacy_version, accepted: true, source, accepted_at: md.privacy_accepted_at })
  }
  if (md.dpa_version && md.dpa_accepted_at) {
    rows.push({ kind: 'dpa', version: md.dpa_version, accepted: true, source, accepted_at: md.dpa_accepted_at })
  }
  if (md.terms_version && md.terms_accepted_at) {
    rows.push({ kind: 'terms', version: md.terms_version, accepted: true, source, accepted_at: md.terms_accepted_at })
  }
  /* Record the marketing choice (in or out) at the moment it was made — an
     opt-out is timestamped at the privacy-acceptance moment (signup). */
  const mAt = md.marketing_consent_at || md.privacy_accepted_at
  if (md.marketing_consent !== undefined && mAt) {
    rows.push({ kind: 'marketing', version: null, accepted: !!md.marketing_consent, source, accepted_at: mAt })
  }
  return rows
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
