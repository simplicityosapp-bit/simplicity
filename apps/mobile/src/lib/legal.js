// Consent captured at signup, stored in the auth user's metadata (mirrors web
// lib/legal.js buildConsent). KEEP THESE VERSIONS IN SYNC WITH apps/web/src/lib/
// legal.js — a mismatch would make web's ConsentGate re-prompt a mobile signup.
export const PRIVACY_VERSION = '2.2'
export const DPA_VERSION = '2.0'
export const TERMS_VERSION = '2.0'

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
