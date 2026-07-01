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

/* 2026-06-13: privacy + DPA text updated (field-encryption removed → wording now
   says access-control + infra at-rest encryption, not field-level AES / "not
   readable by team"). Bumped to 1.1 to force re-acceptance.
   2026-06-16: footer version display fixed; landing-page AES-256 claims removed.
   Bumped to 1.2 — rule: any policy text change must bump version.
   2026-06-17: privacy + terms text overhauled from new legal-SaaS source docs
   (Amendment-13 / תיקון 13 notices, DPO, breach-notification, international
   transfer, anti-spam; terms: anti-scraping/anti-AI-training, arbitration +
   class-action waiver, force majeure, severability, assignment, upgraded
   liability cap). 3 corrections applied vs source: Anthropic/Claude vendor
   removed, analytics marked future, AI-training reframed to "we do NOT train
   on personal data". Privacy 1.2→2.0, Terms 1.0→2.0.
   DPA 1.2→1.3: aligned §3 AI-training wording to the firm no-training stance.
   DPA 1.3→2.0: full upgrade to match privacy/terms — תיקון 13 + level-3/DPO
   security, sub-processor binding + change-notice, breach reporting to the
   Authority + assist, assist-controller with data-subject requests, intl
   transfer, staff confidentiality.
   2026-06-21: privacy §11 (cookies) reworded — the absolute "no advertising /
   third-party tracking cookies" claim replaced with consent-gated language:
   essential cookies are exempt, and analytics + advertising cookies (incl.
   retargeting landing-page visitors) are used only with consent given via the
   site cookie banner, are not loaded until consent, and are revocable. Matches
   the new public cookie banner. Privacy 2.0→2.1 (forces re-acceptance).
   2026-06-25: end-client data list (§4.2) extended — client address + date of
   birth added as optional fields (both plaintext, like name/phone/email; stored
   behind a "more details" toggle in the client card). Privacy 2.1→2.2 (forces
   re-acceptance) — rule: any policy text change must bump version. */
export const PRIVACY_VERSION = '2.2'
export const DPA_VERSION = '2.0'
export const TERMS_VERSION = '2.0'

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
   have no recorded consent), OR any of the three binding documents is stale —
   privacy, DPA (data-processing agreement), or terms. All three are checked so
   a version bump to ANY single document forces re-acceptance; checking only
   privacy+terms let a DPA-only bump slip through silently. (buildConsent /
   buildReacceptance always write all three together, so this never falsely
   re-prompts an up-to-date user.) */
export function needsReacceptance(user) {
  const md = user?.user_metadata
  return md?.privacy_version !== PRIVACY_VERSION
    || md?.dpa_version !== DPA_VERSION
    || md?.terms_version !== TERMS_VERSION
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
