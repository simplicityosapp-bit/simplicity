/* ════════════════════════════════════════════════════════════════
   IMPORT — a long run reports that it is working.
   ════════════════════════════════════════════════════════════════
   The importer writes one row per round trip on purpose: each gets its own
   try/catch so a single bad row is named rather than failing the run. On a
   real spreadsheet that is several hundred sequential requests, and the
   only signal used to be a button reading "יוצר…" — indistinguishable from
   a hang for a minute or more.

   It now reports every row. What matters isn't that a callback fires, it's
   that the numbers are trustworthy: a bar that stalls at 80% because
   duplicate rows never ticked, or that sits at 100% while payments are
   still being written, is worse than no bar at all. These pin that.

   The API layer is mocked, so nothing here touches Supabase.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let created = 0
const ok = (extra = {}) => { created += 1; return Promise.resolve({ id: `row-${created}`, ...extra }) }
const none = () => Promise.resolve([])

vi.mock('../src/lib/api/clients', () => ({ insertClient: () => ok(), listClients: none }))
vi.mock('../src/lib/api/projects', () => ({ insertProject: () => ok(), listProjects: none }))
vi.mock('../src/lib/api/transactions', () => ({ insertTransaction: () => ok(), listTransactions: none }))
vi.mock('../src/lib/api/paymentPlans', () => ({ insertPaymentPlan: () => ok(), insertPaymentInstallments: () => Promise.resolve(), listPaymentPlans: none }))
vi.mock('../src/lib/api/recurring', () => ({ insertRecurring: () => ok(), listRecurring: none }))
vi.mock('../src/lib/api/clientStatuses', () => ({ insertClientStatus: () => ok(), listClientStatuses: none }))
vi.mock('../src/lib/api/leadStatuses', () => ({ insertLeadStatus: () => ok(), listLeadStatuses: none }))
vi.mock('../src/lib/api/leads', () => ({ insertLead: () => ok(), listLeads: none }))
vi.mock('../src/lib/api/sessions', () => ({ insertSession: () => ok(), listSessions: none }))
vi.mock('../src/lib/api/categories', () => ({ listCategories: none, insertCategory: () => ok(), CATEGORY_COLORS: ['#000'] }))

const { finalizeOnboardingImport } = await import('../src/lib/onboardingImport')

const run = async (payload) => {
  const events = []
  const summary = await finalizeOnboardingImport({ ...payload, nowIso: '2026-07-27T00:00:00.000Z', onProgress: (p) => events.push(p) })
  return { events, summary }
}

beforeEach(() => { created = 0 })

describe('progress reporting', () => {
  it('announces itself before the first write, so the screen changes immediately', async () => {
    const { events } = await run({ clients: [{ name: 'א' }, { name: 'ב' }] })
    expect(events[0]).toMatchObject({ phase: 'start', done: 0 })
    expect(events[0].total).toBeGreaterThan(0)
  })

  it('never runs backwards and never exceeds its total', async () => {
    const { events } = await run({
      projects: [{ name: 'פ' }],
      clients: [{ name: 'א', paid: 100 }, { name: 'ב' }],
      transactions: [{ amount: 50, type: 'income', date: '2026-01-01' }],
      leads: [{ name: 'ל' }],
    })
    let prev = -1
    for (const e of events) {
      expect(e.done).toBeGreaterThanOrEqual(prev)
      expect(e.done).toBeLessThanOrEqual(e.total)
      prev = e.done
    }
  })

  it('reaches its total — the bar actually completes', async () => {
    const { events } = await run({
      projects: [{ name: 'פ' }],
      clients: [{ name: 'א' }],
      transactions: [{ amount: 50, type: 'income', date: '2026-01-01' }],
      leads: [{ name: 'ל' }],
    })
    const last = events.at(-1)
    expect(last.done).toBe(last.total)
  })

  it('ticks skipped rows too, or a file with duplicates stalls short of the end', async () => {
    /* Both clients carry the same name; the second is deduped and never
       written. If only written rows ticked, the bar would stop at 50%. */
    const { events, summary } = await run({ clients: [{ name: 'דנה' }, { name: 'דנה' }] })
    expect(summary.clients.created).toBe(1)
    expect(summary.clients.skipped).toBe(1)
    const last = events.at(-1)
    expect(last.done).toBe(last.total)
  })

  it('grows the total when it discovers derived work, rather than sitting at 100%', async () => {
    /* A client with `paid` produces a payment transaction that the payload
       never listed, so it cannot be counted up front. */
    const { events } = await run({ clients: [{ name: 'א', paid: 250 }] })
    const first = events[0]
    const last = events.at(-1)
    expect(last.total).toBeGreaterThan(first.total)
    expect(last.done).toBe(last.total)
    expect(events.some((e) => e.phase === 'payments')).toBe(true)
  })

  it('names the phase it is in, so the label is not just a number', async () => {
    const { events } = await run({
      projects: [{ name: 'פ' }],
      clients: [{ name: 'א', status_name: 'פעיל' }],
      transactions: [{ amount: 50, type: 'income', date: '2026-01-01' }],
      leads: [{ name: 'ל' }],
    })
    const phases = [...new Set(events.map((e) => e.phase))]
    expect(phases).toContain('statuses')
    expect(phases).toContain('projects')
    expect(phases).toContain('clients')
    expect(phases).toContain('transactions')
    expect(phases).toContain('leads')
  })

  it('is entirely optional — the importer runs without a callback', async () => {
    const summary = await finalizeOnboardingImport({ clients: [{ name: 'א' }], nowIso: '2026-07-27T00:00:00.000Z' })
    expect(summary.clients.created).toBe(1)
  })

  it('reports nothing when there is nothing to import', async () => {
    const { events } = await run({})
    expect(events).toEqual([])
  })
})
