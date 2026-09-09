/* ════════════════════════════════════════════════════════════════
   LANDING EVENTS — anonymous funnel beacons for the marketing landing (/).
   ════════════════════════════════════════════════════════════════
   Fire-and-forget, no PII, no cookies. A per-tab random session id
   (sessionStorage) links view → signup_start within one session and is
   NOT a persistent identifier — it clears when the tab closes. Each event
   type is sent at most once per tab-session. Failures are swallowed: this
   never blocks navigation or shows the visitor an error.

   The id is ALSO mirrored to localStorage, because the funnel's last stage —
   signup_complete — happens after the landing page is gone: on the signup
   screen, or after a full-page round trip to Google and back. Only the id
   travels; it still maps to no person and carries no user_id. */

import { supabase } from '../supabase'

const SID_KEY = 'lp_sid'
const SENT_PREFIX = 'lp_sent_'
/* Survives the landing → signup navigation, a refresh, and the OAuth round
   trip — which sessionStorage alone does not (a new tab starts empty).
   Stored as { sid, at } so it can expire; see SID_TTL_MS. */
const PERSISTED_SID_KEY = 'simplicity_landing_sid'
/* How long a landing visit may still claim a signup. Without a limit the id
   never expires, so someone who read the page once in March and signed up in
   September would be credited to that March session — the funnel would show
   a conversion the landing page did not cause. Thirty days is the usual
   attribution window, and the stamp is refreshed by every landing event, so
   the clock runs from the LAST visit, not the first. */
const SID_TTL_MS = 30 * 24 * 60 * 60 * 1000
/* Holds the sid signup_complete was already sent for, so the event fires once
   per landing session rather than once per browser: a fresh landing visit
   mints a new sid and this stops matching. */
const COMPLETE_SENT_KEY = 'simplicity_landing_signup_complete_sent'

function sessionId() {
  try {
    let id = window.sessionStorage.getItem(SID_KEY)
    if (!id) {
      id = (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
      window.sessionStorage.setItem(SID_KEY, id)
    }
    /* Mirrored on every call, not only at creation: localStorage may have been
       cleared, or this tab may predate the key existing. Re-stamping on each
       event is what makes the window run from the last visit. */
    try {
      window.localStorage.setItem(PERSISTED_SID_KEY, JSON.stringify({ sid: id, at: Date.now() }))
    } catch { /* ignore */ }
    return id
  } catch { return null }
}

/* The stored landing sid, or null when there is none, it has expired, or it
   cannot be read. Anything that is not a well-formed, in-window { sid, at }
   counts as absent — including the bare-string form written before this key
   carried a timestamp, which JSON.parse rejects. An expired entry is cleared
   on the way out so it is not re-examined on every later signup. */
function readPersistedSid() {
  try {
    const raw = window.localStorage.getItem(PERSISTED_SID_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw)
    if (!stored || typeof stored.sid !== 'string' || typeof stored.at !== 'number') return null
    if (Date.now() - stored.at > SID_TTL_MS) {
      try { window.localStorage.removeItem(PERSISTED_SID_KEY) } catch { /* ignore */ }
      return null
    }
    return stored.sid
  } catch { return null }
}

/* Post one event. Never throws, never returns a rejected promise. */
function send(type, sid) {
  try {
    supabase.functions
      .invoke('landing-events', { method: 'POST', body: { type, sid } })
      .catch(() => { /* fire-and-forget */ })
  } catch { /* ignore */ }
}

/* Send a landing funnel event ('view' | 'signup_start') at most once per
   tab-session per type. Safe to call from render effects / click handlers. */
export function trackLandingEvent(type) {
  try {
    const flag = SENT_PREFIX + type
    if (window.sessionStorage.getItem(flag)) return
    window.sessionStorage.setItem(flag, '1')
  } catch { /* sessionStorage unavailable — still try to send once */ }
  send(type, sessionId())
}

/* ════════════════════════════════════════════════════════════════
   Which scroll-depth thresholds a viewport position has passed.
   ════════════════════════════════════════════════════════════════
   Pure, so the rule can be tested without a browser — and it needed one.
   The landing screen used to evaluate these thresholds directly, including
   on the very first call, which happens at mount before the visitor has
   touched anything. At that moment the page is routinely shorter than it
   will be (images still loading, reveal blocks not yet expanded), so

       depth = (scrollY + viewportH) / docH

   comes out at or near 1 with nobody having scrolled, and all three
   thresholds fire in the same millisecond. Measured over 366 real sessions:
   42% of scroll_50 and 38% of scroll_100 were logged within one second of
   the view event. Genuine readers take 44 seconds on average to reach the
   bottom; none of them do it in one.

   So two guards. Nothing counts until the visitor has actually scrolled —
   a resize is not a scroll, and neither is a restored scroll position. And
   a document that cannot meaningfully scroll has no depth to report: the
   ratio is meaningless when the page fits the screen. */
const THRESHOLDS = [
  [0.5, 'scroll_50'],
  [0.75, 'scroll_75'],
  [0.98, 'scroll_100'],
]

/* How much taller than the viewport the document must be before depth means
   anything. A page within a couple of hundred pixels of the viewport is one
   screen; calling the bottom of it "read to 100%" is noise. */
const MIN_SCROLLABLE_PX = 200

export function scrollDepthEvents({ scrollY, viewportH, docH, hasScrolled }) {
  if (!hasScrolled) return []
  if (!(docH > viewportH + MIN_SCROLLABLE_PX)) return []
  const depth = (scrollY + viewportH) / docH
  return THRESHOLDS.filter(([at]) => depth >= at).map(([, type]) => type)
}

/* The funnel's last stage: an account was actually created. Called from every
   signup path (email/password on success, Google on the authenticated return)
   and carries the sid the visitor arrived with, so the whole chain
   view → signup_start → signup_complete shares one session id.

   'direct' when no landing session is in force — someone who reached /signup
   without ever passing through the landing page, or whose last visit is older
   than the attribution window. (session_id is nullable, so this is a
   deliberate label, not a NOT NULL workaround.)

   Sent at most once per landing session, and wrapped end to end: a failure
   here must never block a signup that already succeeded. */
export function trackSignupComplete() {
  try {
    const sid = readPersistedSid() || 'direct'
    try {
      if (window.localStorage.getItem(COMPLETE_SENT_KEY) === sid) return
      window.localStorage.setItem(COMPLETE_SENT_KEY, sid)
    } catch { /* localStorage unavailable — still try to send once */ }
    send('signup_complete', sid)
  } catch { /* never let analytics break a completed signup */ }
}
