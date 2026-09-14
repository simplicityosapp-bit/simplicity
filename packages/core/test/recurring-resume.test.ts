/* ════════════════════════════════════════════════════════════════
   RESUMING A PAUSED RULE — the backlog is the user's call.
   ════════════════════════════════════════════════════════════════
   Resuming used to fill every period missed during the pause with a
   pending row, silently. Now the apps ask: create them as pending, or mark
   them skipped. These pin what counts as missed, that marking really stops
   the engine, and the order of the writes — skipped rows first, the rule
   second, so no pass in between can create the same periods as pending.
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect } from 'vitest'
import { generateRecurringTransactions, missedOnResume, resumeRecurringTemplate } from '../src/domain/recurring'

const NOW = new Date('2026-08-20T12:00:00')
const paused = {
  id: 't1', active: false, trigger_type: 'schedule', cadence_type: 'monthly_date',
  day_of_month: 1, amount: 900, type: 'expense', created_at: '2026-01-01T00:00:00',
}
const rows = ['2026-03-01', '2026-04-01', '2026-05-01'].map((date) => ({ recurring_id: 't1', date, scheduled_meeting_id: null }))
const dates = (out: Array<{ date: string }>) => out.map((p) => p.date)

describe('missedOnResume', () => {
  it('lists every period since the newest row, oldest first', () => {
    expect(dates(missedOnResume(paused, rows, NOW))).toEqual(['2026-06-01', '2026-07-01', '2026-08-01'])
  })

  it('is empty for a rule that is not paused', () => {
    expect(missedOnResume({ ...paused, active: true }, rows, NOW)).toEqual([])
  })

  it('leaves out meetings still to come — those are not missed', () => {
    const onMeeting = { id: 'm1', active: false, trigger_type: 'on_meeting', client_id: 'c1', amount: 250, type: 'income' }
    const meetings = [
      { id: 'past', subject_type: 'client', subject_id: 'c1', status: 'pending', scheduled_at: '2026-08-10T09:00:00' },
      { id: 'next', subject_type: 'client', subject_id: 'c1', status: 'pending', scheduled_at: '2026-08-25T09:00:00' },
    ]
    expect(missedOnResume(onMeeting, [], NOW, meetings).map((p) => p.scheduled_meeting_id)).toEqual(['past'])
  })
})

describe('resumeRecurringTemplate', () => {
  it('marking skipped writes the rows first, then resumes — and the engine owes nothing after', async () => {
    const missed = missedOnResume(paused, rows, NOW)
    const log: string[] = []
    const written: Array<{ date: string, status: string }> = []
    await resumeRecurringTemplate({
      template: paused,
      missed,
      markSkipped: true,
      addTransaction: async (row) => { log.push('add'); written.push(row as { date: string, status: string }) },
      updateRecurring: async () => { log.push('resume') },
    })
    expect(log).toEqual(['add', 'add', 'add', 'resume'])
    expect(written.every((r) => r.status === 'skipped')).toBe(true)
    const after = [...rows, ...written.map((r) => ({ recurring_id: 't1', date: r.date, scheduled_meeting_id: null }))]
    expect(generateRecurringTransactions([{ ...paused, active: true }], after, NOW)).toEqual([])
  })

  it('creating them as pending only resumes — the engine writes them', async () => {
    const log: string[] = []
    await resumeRecurringTemplate({
      template: paused,
      missed: missedOnResume(paused, rows, NOW),
      markSkipped: false,
      addTransaction: async () => { log.push('add') },
      updateRecurring: async (_id, patch) => { log.push(`resume:${patch.active}`) },
    })
    expect(log).toEqual(['resume:true'])
  })

  it('a period that already has its row is fine; any other failure leaves the rule paused', async () => {
    const missed = missedOnResume(paused, rows, NOW)
    let resumed = false
    await resumeRecurringTemplate({
      template: paused, missed, markSkipped: true,
      addTransaction: async () => { throw Object.assign(new Error('duplicate'), { code: '23505' }) },
      updateRecurring: async () => { resumed = true },
    })
    expect(resumed).toBe(true)

    resumed = false
    await expect(resumeRecurringTemplate({
      template: paused, missed, markSkipped: true,
      addTransaction: async () => { throw new Error('offline') },
      updateRecurring: async () => { resumed = true },
    })).rejects.toThrow('offline')
    expect(resumed).toBe(false)
  })
})
