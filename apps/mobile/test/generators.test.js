/* ════════════════════════════════════════════════════════════════
   GENERATORS — the rows a phone-only coach was never given.
   ════════════════════════════════════════════════════════════════
   Only the browser used to run the engines that turn a recurring rule
   into pending income, a weekly slot into meetings, and an auto-confirmed
   booking into a lead. These drive a whole pass against an in-memory
   backend and pin the rules that make a second writer safe:

     · nothing is written when any read fails — an empty list reads as
       "nothing exists yet" and would recreate every slot;
     · a second pass writes nothing;
     · a duplicate the database turns away is "already there", not a
       failure;
     · a real failure stops the recurring rows, because the engine never
       looks behind the newest row it finds.
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect } from 'vitest'
import { runGenerationPass, isDue, MIN_INTERVAL_MS } from '../src/lib/generators'

const NOW = new Date('2026-07-20T12:00:00')

/* Just enough PostgREST to run a pass: select with is/not/eq/order/range,
   insert/update/delete returning { data, error }. */
function backend(tables = {}, { failInsert, failRead } = {}) {
  const db = JSON.parse(JSON.stringify(tables))
  const invoked = []
  let seq = 0
  const from = (table) => {
    const s = { op: 'select', payload: null, filters: [], range: null }
    const exec = () => {
      const rows = db[table] || []
      if (s.op === 'insert') {
        const error = failInsert?.(table, s.payload)
        if (error) return { data: null, error }
        const row = { id: `${table}-${++seq}`, ...s.payload }
        db[table] = [...rows, row]
        return { data: row, error: null }
      }
      const hit = rows.filter((r) => s.filters.every((f) => f(r)))
      if (s.op === 'update') { hit.forEach((r) => Object.assign(r, s.payload)); return { data: hit[0] ?? null, error: null } }
      if (s.op === 'delete') { db[table] = rows.filter((r) => !hit.includes(r)); return { data: null, error: null } }
      if (failRead === table) return { data: null, error: { message: 'Network request failed' } }
      return { data: s.range ? hit.slice(s.range[0], s.range[1] + 1) : hit, error: null }
    }
    const q = {
      select: () => q,
      order: () => q,
      single: () => q,
      is: (c, v) => { s.filters.push((r) => (r[c] ?? null) === v); return q },
      not: (c, _op, v) => { s.filters.push((r) => (r[c] ?? null) !== v); return q },
      eq: (c, v) => { s.filters.push((r) => r[c] === v); return q },
      range: (a, b) => { s.range = [a, b]; return q },
      insert: (p) => { s.op = 'insert'; s.payload = p; return q },
      update: (p) => { s.op = 'update'; s.payload = p; return q },
      delete: () => { s.op = 'delete'; return q },
      then: (resolve, reject) => Promise.resolve(exec()).then(resolve, reject),
    }
    return q
  }
  const client = {
    from,
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    functions: { invoke: async (fn, opts) => { invoked.push({ fn, body: opts?.body }); return { data: {}, error: null } } },
  }
  return { client, db, invoked }
}

const monthlyRule = (patch = {}) => ({
  id: 'r1', active: true, trigger_type: 'schedule', cadence_type: 'monthly_date', day_of_month: 1,
  amount: 300, type: 'expense', desc: 'שכירות', created_at: '2026-04-01T00:00:00', deleted_at: null, ...patch,
})
const txDates = (db) => (db.transactions || []).map((t) => t.date).sort()

describe('recurring rules', () => {
  it("writes the rows a rule owes, as the signed-in user's, and nothing the second time", async () => {
    const { client, db } = backend({ recurring_templates: [monthlyRule()] })
    const first = await runGenerationPass(client, NOW)
    expect(first.transactions).toBe(4)
    expect(txDates(db)).toEqual(['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01'])
    expect(db.transactions.every((t) => t.user_id === 'u1' && t.status === 'pending' && t.recurring_id === 'r1')).toBe(true)

    const second = await runGenerationPass(client, NOW)
    expect(second).toEqual({ meetings: 0, transactions: 0, bookings: 0, failed: 0 })
    expect(db.transactions).toHaveLength(4)
  })

  it('stops at the first failed insert, so no row is written past a gap', async () => {
    const failInsert = (table, row) => (table === 'transactions' && row.date === '2026-05-01' ? { message: 'timeout' } : null)
    const { client, db } = backend({ recurring_templates: [monthlyRule()] }, { failInsert })
    const result = await runGenerationPass(client, NOW)
    expect(result.failed).toBe(1)
    expect(txDates(db)).toEqual(['2026-04-01'])
  })

  it('reads a duplicate the database turned away as already there', async () => {
    const failInsert = (table, row) => (table === 'transactions' && row.date === '2026-05-01' ? { code: '23505', message: 'duplicate key' } : null)
    const { client, db } = backend({ recurring_templates: [monthlyRule()] }, { failInsert })
    const result = await runGenerationPass(client, NOW)
    expect(result.failed).toBe(0)
    expect(txDates(db)).toEqual(['2026-04-01', '2026-06-01', '2026-07-01'])
  })
})

describe('partial data', () => {
  it('writes nothing at all when any read fails', async () => {
    const { client, db } = backend({ recurring_templates: [monthlyRule()] }, { failRead: 'clients' })
    await expect(runGenerationPass(client, NOW)).rejects.toBeTruthy()
    expect(db.transactions).toBeUndefined()
  })
})

describe('meetings and the rules that bill them', () => {
  it('creates the weekly meetings first, so a per-meeting rule bills them in the same pass', async () => {
    const { client, db } = backend({
      clients: [{ id: 'c1', name: 'דנה', status_meta: 'active', recurring_day: 2, recurring_time: '10:00', created_at: '2026-06-01T00:00:00Z', deleted_at: null }],
      recurring_templates: [{ id: 'r2', active: true, trigger_type: 'on_meeting', client_id: 'c1', amount: 250, type: 'income', deleted_at: null }],
    })
    const result = await runGenerationPass(client, NOW)
    expect(result.meetings).toBeGreaterThan(0)
    expect(result.transactions).toBe(result.meetings)
    const meetingIds = new Set(db.scheduled_meetings.map((m) => m.id))
    expect(db.transactions.every((t) => meetingIds.has(t.scheduled_meeting_id))).toBe(true)

    const again = await runGenerationPass(client, NOW)
    expect(again.meetings + again.transactions).toBe(0)
  })
})

describe('auto-confirmed bookings', () => {
  it('become a lead and an owned calendar event, once', async () => {
    const booking = { id: 'b1', status: 'confirmed', event_id: null, lead_id: null, name: 'נועה', phone: '0501234567', starts_at: '2026-07-21T07:00:00Z', ends_at: '2026-07-21T08:00:00Z' }
    const { client, db, invoked } = backend({ bookings: [booking] })
    const result = await runGenerationPass(client, NOW)
    expect(result.bookings).toBe(1)
    expect(db.leads).toHaveLength(1)
    expect(db.calendar_events).toHaveLength(1)
    expect(db.calendar_events[0]).toMatchObject({ google_event_id: 'booking:b1', owned: true, lead_id: db.leads[0].id, duration_minutes: 60 })
    expect(db.bookings[0]).toMatchObject({ lead_id: db.leads[0].id, event_id: db.calendar_events[0].id })
    expect(invoked).toEqual([{ fn: 'google-calendar', body: { action: 'push-booking', bookingId: 'b1' } }])

    await runGenerationPass(client, NOW)
    expect(db.leads).toHaveLength(1)
  })

  it('leaves a booking that is still waiting for approval alone', async () => {
    const { client, db } = backend({ bookings: [{ id: 'b2', status: 'pending', event_id: null, starts_at: '2026-07-21T07:00:00Z', ends_at: '2026-07-21T08:00:00Z' }] })
    await runGenerationPass(client, NOW)
    expect(db.leads).toBeUndefined()
  })
})

describe('isDue', () => {
  it('runs the first time, then not again inside the interval', () => {
    const t = NOW.getTime()
    expect(isDue(null, t)).toBe(true)
    expect(isDue(t, t + MIN_INTERVAL_MS - 1)).toBe(false)
    expect(isDue(t, t + MIN_INTERVAL_MS)).toBe(true)
  })
})
