/* ════════════════════════════════════════════════════════════════
   SIGNUP CONSENT — and the version numbers that must not drift.
   ════════════════════════════════════════════════════════════════
   src/lib/legal.js opens with an instruction: KEEP THESE VERSIONS IN SYNC
   WITH apps/web/src/lib/legal.js. The consequence of ignoring it is
   specific and invisible from this side — a user who signs up on the
   phone gets consent stamped with a version web does not recognise, and
   web's ConsentGate re-prompts them for terms they just accepted. Nothing
   fails here; the damage shows up in the other app.

   A comment cannot enforce that. This imports BOTH modules and compares
   them, so the next person to bump a version on one side is told by a red
   test rather than by a confused user.
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect } from 'vitest'
import {
  buildConsent,
  PRIVACY_VERSION,
  DPA_VERSION,
  TERMS_VERSION,
} from '../src/lib/legal'
import * as web from '../../web/src/lib/legal'

describe('the versions the two apps stamp', () => {
  it('match web, or a mobile signup gets re-prompted on the web', () => {
    expect(
      { privacy: PRIVACY_VERSION, dpa: DPA_VERSION, terms: TERMS_VERSION },
    ).toEqual(
      { privacy: web.PRIVACY_VERSION, dpa: web.DPA_VERSION, terms: web.TERMS_VERSION },
    )
  })
})

describe('buildConsent', () => {
  const NOW = '2026-09-08T09:00:00.000Z'

  it('stamps all three documents at the same moment', () => {
    const c = buildConsent({}, NOW)
    expect(c.privacy_accepted_at).toBe(NOW)
    expect(c.dpa_accepted_at).toBe(NOW)
    expect(c.terms_accepted_at).toBe(NOW)
  })

  it('records the version accepted beside each acceptance', () => {
    const c = buildConsent({}, NOW)
    expect(c.privacy_version).toBe(PRIVACY_VERSION)
    expect(c.dpa_version).toBe(DPA_VERSION)
    expect(c.terms_version).toBe(TERMS_VERSION)
  })

  /* Marketing is opt-in and separate from the three required documents.
     Defaulting it to true, or stamping a time for a consent that was not
     given, would be a claim the user never made. */
  it('defaults marketing consent to off, with no timestamp', () => {
    const c = buildConsent({}, NOW)
    expect(c.marketing_consent).toBe(false)
    expect(c.marketing_consent_at).toBeNull()
  })

  it('timestamps marketing only when it was actually given', () => {
    const c = buildConsent({ marketing: true }, NOW)
    expect(c.marketing_consent).toBe(true)
    expect(c.marketing_consent_at).toBe(NOW)
  })

  it('treats a missing argument as no marketing consent', () => {
    expect(buildConsent(undefined, NOW).marketing_consent).toBe(false)
  })
})
