/* ════════════════════════════════════════════════════════════════
   COOKIE CONSENT — the public cookie banner's stored choice.
   ════════════════════════════════════════════════════════════════
   The site uses only essential (technical) cookies today — auth session
   state — which are exempt from consent. Analytics and advertising cookies
   are PLANNED (incl. retargeting landing-page visitors); when added they
   MUST be gated on this stored choice (cookiesAccepted) and must default to
   off until the visitor explicitly accepts. The banner's accept / reject
   choice records that preference now, ahead of those integrations.

   Stored in localStorage (works for logged-out visitors, no DB / network).
   Shape: { choice: 'accepted' | 'rejected', at: <ISO timestamp> }. The
   timestamp is captured ONCE at the moment of choice and kept stable, so
   mirroring it into the durable user_consent log (on login) is idempotent
   — the log upserts on (user_id, kind, accepted_at). See ConsentSync.
   ════════════════════════════════════════════════════════════════ */

export const COOKIE_CONSENT_KEY = 'simplicity_cookie_consent'

/* Read the stored choice object, or null if the visitor hasn't chosen yet. */
export function readCookieConsent() {
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.choice === 'accepted' || parsed?.choice === 'rejected') return parsed
    return null
  } catch { return null }
}

/* True once a choice (either way) has been made. */
export function hasCookieChoice() {
  return !!readCookieConsent()
}

/* True when non-essential cookies are allowed. Planned analytics / advertising
   integrations MUST check this before setting any non-essential cookie — it
   returns false until the visitor explicitly accepts (opt-in default). */
export function cookiesAccepted() {
  return readCookieConsent()?.choice === 'accepted'
}

/* Persist the visitor's choice. accepted=false records an explicit reject —
   both are remembered so the banner doesn't reappear. Returns the stored
   object (incl. the stable timestamp) so callers can mirror it immediately. */
export function setCookieConsent(accepted) {
  const value = { choice: accepted ? 'accepted' : 'rejected', at: new Date().toISOString() }
  try { window.localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(value)) } catch { /* ignore */ }
  return value
}

/* Derive the durable user_consent row from a stored choice object (for the
   logged-in mirror). Same row shape as consentRowsFromMetadata in lib/legal.js;
   `accepted_at` is the stable choice timestamp → idempotent re-recording. */
export function cookieConsentRow(stored, source = 'cookie_banner') {
  if (!stored?.at || (stored.choice !== 'accepted' && stored.choice !== 'rejected')) return null
  return {
    kind: 'cookies',
    version: null,
    accepted: stored.choice === 'accepted',
    source,
    accepted_at: stored.at,
  }
}
