/* ════════════════════════════════════════════════════════════════
   THE ONBOARDING GATE — who gets held, and who must never be.
   ════════════════════════════════════════════════════════════════
   shouldOnboard decides whether the app holds a signed-in user in the
   introduction flow. It has two failure directions and they are not
   symmetric:

     · letting someone through who never onboarded means the free-tier
       client cap does not apply to them, because the database reads
       onboarding_completed() in an RLS policy. A leak.
     · HOLDING someone who finished months ago means an existing user is
       marched back through the flow on every cold start, unable to reach
       their own data. Far worse, and the likelier bug: preferences arrive
       as {}, so "no onboarding record" and "not loaded yet" look
       identical unless the code is careful.

   These pin that asymmetry. The provider is mocked away — this is about
   the decision, not about loading.
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi } from 'vitest'

/* lib/onboarding imports the preferences provider, which reaches for
   react-native, AsyncStorage and Supabase at module load. None of that is
   involved in the decision, so it is stubbed rather than resolved. */
vi.mock('../src/lib/preferences', () => ({
  usePreferences: () => ({ prefs: {}, update: async () => {}, status: 'ready' }),
  roleLabel: () => '',
}))

const { shouldOnboard } = await import('../src/lib/onboarding')
const { defaultOnboarding } = await import('@simplicity/core')

const state = (patch = {}) => ({ ...defaultOnboarding(), ...patch })
const AT = '2026-09-08T09:00:00.000Z'

describe('while preferences are still loading', () => {
  /* The one that would have shipped. prefs start as {}, so a gate that
     asked "is there a completed_at?" would say no for every user on every
     cold start — including someone who finished the flow a year ago. */
  it('holds nobody, whatever the state looks like', () => {
    expect(shouldOnboard({ status: 'loading', state: state() })).toBe(false)
    expect(shouldOnboard({ status: 'loading', state: state({ completed_at: AT }) })).toBe(false)
  })
})

describe('when the preferences read failed', () => {
  /* We know nothing. Trapping someone who finished long ago behind a flow
     they cannot escape is a worse failure than the cap going unapplied for
     one session, so the unknown case lets them through. */
  it('lets the user through rather than trapping them', () => {
    expect(shouldOnboard({ status: 'error', state: state() })).toBe(false)
    expect(shouldOnboard({ status: 'error', state: state({ completed_at: AT }) })).toBe(false)
  })
})

describe('once preferences are known', () => {
  it('holds a user who has never been through the flow', () => {
    expect(shouldOnboard({ status: 'ready', state: state() })).toBe(true)
  })

  it('releases a user who completed it', () => {
    expect(shouldOnboard({ status: 'ready', state: state({ completed_at: AT }) })).toBe(false)
  })

  /* Skipping is a real exit, not an unfinished flow: the guard releases,
     and the home setup card is what brings them back. Reading skipped_at
     as "not done" would re-gate them on every launch. */
  it('releases a user who skipped it', () => {
    expect(shouldOnboard({ status: 'ready', state: state({ skipped_at: AT }) })).toBe(false)
  })

  /* Mid-flow is still not done — being on step four is not an exit. */
  it('keeps holding someone part-way through', () => {
    expect(shouldOnboard({ status: 'ready', state: state({ step: 'goals', started_at: AT }) })).toBe(true)
  })
})

describe('an account with no preferences row at all', () => {
  /* A brand-new user reads as {}, which migrateOnboarding turns into the
     default — genuinely "never onboarded", and the one case that SHOULD
     be held. Distinct from 'loading', which looks identical in the data
     and is separated only by status. */
  it('is a first run, and is held', () => {
    expect(shouldOnboard({ status: 'ready', state: state() })).toBe(true)
  })
})
