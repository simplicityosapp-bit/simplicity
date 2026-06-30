/* ════════════════════════════════════════════════════════════════
   SUBSCRIPTION SUITE — effective-tier resolution + capability gates.
   ════════════════════════════════════════════════════════════════
   effectiveTier() MUST stay in lockstep with current_tier() in
   migration 0075 (an active beta exemption ⇒ premium; missing row ⇒
   free). The capability gates are governed by the BILLING_ENABLED
   master switch — while it's off, everything is open / unlimited. */
import { describe, it, expect } from 'vitest'
import {
  BILLING_ENABLED, TIERS, effectiveTier, isBetaExempt,
  canConnectInvoicing, canConnectGrow, canUseAI,
  clientLimit, goalLimit, projectLimit, pageLimit,
} from '../src/lib/subscription'

const future = new Date(Date.now() + 30 * 86400000).toISOString()
const past = new Date(Date.now() - 30 * 86400000).toISOString()

describe('effectiveTier', () => {
  it('treats a missing row as free', () => {
    expect(effectiveTier(null)).toBe(TIERS.FREE)
    expect(effectiveTier(undefined)).toBe(TIERS.FREE)
  })
  it('passes the stored tier through when there is no exemption', () => {
    expect(effectiveTier({ tier: 'free' })).toBe('free')
    expect(effectiveTier({ tier: 'basic' })).toBe('basic')
    expect(effectiveTier({ tier: 'premium' })).toBe('premium')
  })
  it('an ACTIVE beta exemption overrides to premium', () => {
    expect(effectiveTier({ tier: 'free', beta_exempt_until: future })).toBe('premium')
  })
  it('an EXPIRED beta exemption falls back to the stored tier', () => {
    expect(effectiveTier({ tier: 'free', beta_exempt_until: past })).toBe('free')
    expect(effectiveTier({ tier: 'basic', beta_exempt_until: past })).toBe('basic')
  })
})

describe('isBetaExempt', () => {
  it('is true only for a future exemption', () => {
    expect(isBetaExempt({ beta_exempt_until: future })).toBe(true)
    expect(isBetaExempt({ beta_exempt_until: past })).toBe(false)
    expect(isBetaExempt({})).toBe(false)
    expect(isBetaExempt(null)).toBe(false)
  })
})

describe('capability gates (governed by BILLING_ENABLED)', () => {
  it('paid/premium tiers always have their capabilities', () => {
    // True regardless of the master switch.
    expect(canConnectInvoicing('basic')).toBe(true)
    expect(canConnectGrow('basic')).toBe(true)
    expect(pageLimit('basic', 'landing')).toBe(Infinity)
    expect(canUseAI('premium')).toBe(true)
    // AI is premium-only — basic never gets it once enforcement is on.
    expect(canUseAI('basic')).toBe(BILLING_ENABLED ? false : true)
  })
  it('free tier is gated only once billing is enforced', () => {
    const open = !BILLING_ENABLED
    expect(canConnectInvoicing('free')).toBe(open ? true : false)
    expect(canConnectGrow('free')).toBe(open ? true : false)
    // Free gets ONE page of each kind once enforced; unlimited while off.
    expect(pageLimit('free', 'landing')).toBe(open ? Infinity : 1)
    expect(pageLimit('free', 'lead')).toBe(open ? Infinity : 1)
    expect(pageLimit('free', 'booking')).toBe(open ? Infinity : 1)
    expect(canUseAI('free')).toBe(open ? true : false)
  })
})

describe('limits (governed by BILLING_ENABLED)', () => {
  it('paid tiers are always unlimited', () => {
    expect(clientLimit('basic')).toBe(Infinity)
    expect(goalLimit('premium')).toBe(Infinity)
    expect(projectLimit('basic')).toBe(Infinity)
  })
  it('free tier ceilings apply only when enforced', () => {
    if (BILLING_ENABLED) {
      expect(clientLimit('free')).toBe(10)
      expect(goalLimit('free')).toBe(3)
      expect(projectLimit('free')).toBe(2)
    } else {
      expect(clientLimit('free')).toBe(Infinity)
      expect(goalLimit('free')).toBe(Infinity)
      expect(projectLimit('free')).toBe(Infinity)
    }
  })
})
