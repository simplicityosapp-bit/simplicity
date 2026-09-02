// Consent captured at signup, stored in the auth user's metadata (mirrors web
// lib/legal.js buildConsent). KEEP THESE VERSIONS IN SYNC WITH apps/web/src/lib/
// legal.js — a mismatch would make web's ConsentGate re-prompt a mobile signup.
export const PRIVACY_VERSION = '2.3'
export const DPA_VERSION = '2.0'
// 2026-08-27: terms §5 rewritten for the free public launch (see the changelog
// in web lib/legal.js). Bumped here only to keep a mobile SIGNUP from writing a
// stale version that web would immediately re-prompt on. It does NOT make
// mobile ask an existing user to re-accept: there is no ConsentGate in this app,
// so a mobile-only user never sees the updated terms.
export const TERMS_VERSION = '2.1'

export function buildConsent({ marketing = false } = {}, now = new Date().toISOString()) {
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
