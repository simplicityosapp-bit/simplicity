/* ════════════════════════════════════════════════════════════════
   ACCOUNT DELETION — the grace window that gates the whole app.
   ════════════════════════════════════════════════════════════════
   isDeletionPending sits above everything in App.js: while it is true the
   user sees only the pending-deletion screen. So it decides, on every
   launch, whether someone can reach their own data at all.

   The auth user is removed later by a scheduled edge function; the client
   only records the request. That makes the window's END the thing that
   matters — once it has passed this must go false, or a user whose
   deletion was never carried out is locked out of an account that still
   exists.
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, afterEach } from 'vitest'

/* account.js reaches for the Supabase client at module load, purely for
   resetAllUserData, which is not what is under test here. */
vi.mock('../src/lib/supabase', () => ({ supabase: {} }))

const {
  isDeletionPending,
  buildAccountDeletionRequest,
  ACCOUNT_DELETION_GRACE_DAYS,
} = await import('../src/lib/account')

const DAY = 86400000

afterEach(() => { vi.useRealTimers() })

describe('a request that was just made', () => {
  it('schedules removal a full grace period out', () => {
    const now = new Date('2026-09-08T09:00:00.000Z')
    const req = buildAccountDeletionRequest(now)
    expect(req.requested_at).toBe('2026-09-08T09:00:00.000Z')
    expect(new Date(req.scheduled_for).getTime() - now.getTime())
      .toBe(ACCOUNT_DELETION_GRACE_DAYS * DAY)
  })

  it('is pending, so the app gates', () => {
    const now = new Date('2026-09-08T09:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)
    expect(isDeletionPending({ accountDeletion: buildAccountDeletionRequest(now) })).toBe(true)
  })
})

describe('once the window has passed', () => {
  /* The one that locks someone out. The scheduled function may not have
     run — the account can still exist — so a stale record must stop
     gating rather than gating forever. */
  it('stops gating, even a second late', () => {
    const scheduled = new Date('2026-09-08T09:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(new Date(scheduled.getTime() + 1000))
    expect(isDeletionPending({ accountDeletion: { scheduled_for: scheduled.toISOString() } })).toBe(false)
  })

  it('is still gating a moment before it', () => {
    const scheduled = new Date('2026-09-08T09:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(new Date(scheduled.getTime() - 1000))
    expect(isDeletionPending({ accountDeletion: { scheduled_for: scheduled.toISOString() } })).toBe(true)
  })
})

describe('an account with nothing recorded', () => {
  /* Everything here arrives from a JSONB blob that may be absent, partly
     written, or from an older shape. None of those may gate a user out. */
  it('is never pending', () => {
    expect(isDeletionPending(undefined)).toBe(false)
    expect(isDeletionPending(null)).toBe(false)
    expect(isDeletionPending({})).toBe(false)
    expect(isDeletionPending({ accountDeletion: null })).toBe(false)
    expect(isDeletionPending({ accountDeletion: {} })).toBe(false)
    expect(isDeletionPending({ accountDeletion: { requested_at: '2026-09-08T09:00:00.000Z' } })).toBe(false)
  })
})
