/* ════════════════════════════════════════════════════════════════
   LANDING EVENTS — anonymous funnel beacons for the marketing landing (/).
   ════════════════════════════════════════════════════════════════
   Fire-and-forget, no PII, no cookies. A per-tab random session id
   (sessionStorage) links view → signup_start within one session and is
   NOT a persistent identifier — it clears when the tab closes. Each event
   type is sent at most once per tab-session. Failures are swallowed: this
   never blocks navigation or shows the visitor an error. */

import { supabase } from '../supabase'

const SID_KEY = 'lp_sid'
const SENT_PREFIX = 'lp_sent_'

function sessionId() {
  try {
    let id = window.sessionStorage.getItem(SID_KEY)
    if (!id) {
      id = (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
      window.sessionStorage.setItem(SID_KEY, id)
    }
    return id
  } catch { return null }
}

/* Send a landing funnel event ('view' | 'signup_start') at most once per
   tab-session per type. Safe to call from render effects / click handlers. */
export function trackLandingEvent(type) {
  try {
    const flag = SENT_PREFIX + type
    if (window.sessionStorage.getItem(flag)) return
    window.sessionStorage.setItem(flag, '1')
  } catch { /* sessionStorage unavailable — still try to send once */ }
  const sid = sessionId()
  try {
    supabase.functions
      .invoke('landing-events', { method: 'POST', body: { type, sid } })
      .catch(() => { /* fire-and-forget */ })
  } catch { /* ignore */ }
}
