/* ════════════════════════════════════════════════════════════════
   RECURRING ENGINE — on_meeting per-meeting de-dup (migration 0094).
   ════════════════════════════════════════════════════════════════
   Before 0094 an on_meeting payment de-duped by (recurring_id, DATE), so two
   non-skipped meetings for one client on the SAME day produced only ONE payment.
   Now a generated tx carries scheduled_meeting_id and de-dups by meeting, while
   schedule-cadence rows keep de-duping by date. */
import { describe, it, expect } from 'vitest'
import { generateRecurringTransactions } from '@simplicity/core'

const NOW = new Date('2026-07-15T18:00:00')
const onMeeting = { id: 'tmpl1', active: true, trigger_type: 'on_meeting', client_id: 'c1', amount: 200, type: 'income' }
const meeting = (id, at, status = 'scheduled') => ({ id, subject_type: 'client', subject_id: 'c1', status, scheduled_at: at })

describe('generateRecurringTransactions — on_meeting per-meeting de-dup', () => {
  it('generates one payment PER meeting, including two on the same day', () => {
    const meetings = [meeting('m1', '2026-07-15T09:00:00'), meeting('m2', '2026-07-15T14:00:00')]
    const out = generateRecurringTransactions([onMeeting], [], NOW, meetings)
    expect(out).toHaveLength(2)                                       // was 1 before the fix
    expect(out.map((p) => p.scheduled_meeting_id).sort()).toEqual(['m1', 'm2'])
    expect(out.every((p) => p.amount === 200 && p.recurring_id === 'tmpl1' && p.type === 'income')).toBe(true)
  })

  it('is idempotent — re-running with the generated (meeting-linked) rows yields nothing', () => {
    const meetings = [meeting('m1', '2026-07-15T09:00:00'), meeting('m2', '2026-07-15T14:00:00')]
    const existing = [
      { recurring_id: 'tmpl1', date: '2026-07-15', scheduled_meeting_id: 'm1' },
      { recurring_id: 'tmpl1', date: '2026-07-15', scheduled_meeting_id: 'm2' },
    ]
    expect(generateRecurringTransactions([onMeeting], existing, NOW, meetings)).toHaveLength(0)
  })

  it('does NOT duplicate a meeting that a pre-0094 date-only row already covers', () => {
    const meetings = [meeting('m1', '2026-07-15T09:00:00')]
    const legacy = [{ recurring_id: 'tmpl1', date: '2026-07-15', scheduled_meeting_id: null }]
    expect(generateRecurringTransactions([onMeeting], legacy, NOW, meetings)).toHaveLength(0)
  })

  it('skips skipped/expired meetings', () => {
    const meetings = [meeting('m1', '2026-07-15T09:00:00', 'skipped'), meeting('m2', '2026-07-15T14:00:00', 'expired')]
    expect(generateRecurringTransactions([onMeeting], [], NOW, meetings)).toHaveLength(0)
  })
})

describe('generateRecurringTransactions — schedule cadence unchanged by the key-format change', () => {
  const monthly = { id: 'tmpl2', active: true, trigger_type: 'schedule', cadence_type: 'monthly_date', day_of_month: 10, amount: 500, type: 'expense', created_at: '2026-06-01T00:00:00' }

  it('still generates one per date (scheduled_meeting_id null) and is idempotent', () => {
    const out1 = generateRecurringTransactions([monthly], [], NOW)
    expect(out1.length).toBeGreaterThan(0)
    expect(out1.every((p) => p.scheduled_meeting_id === null)).toBe(true)
    const existing = out1.map((p) => ({ recurring_id: p.recurring_id, date: p.date, scheduled_meeting_id: null }))
    expect(generateRecurringTransactions([monthly], existing, NOW)).toHaveLength(0)
  })
})
