/* ════════════════════════════════════════════════════════════════
   ATTENTION-ORDER SUITE — the "דרושה תשומת לב" rows come out ranked by
   urgency, not by the order the rules happen to run in.

   Before this, insertion order leaked through as display order, so a soft
   45-day "you haven't spoken in a while" nudge could sit above money waiting
   for approval. Since the count badge was removed, the closed card shows only
   the first two rows as a sentence — which makes the ranking the ONLY thing
   deciding what a user sees at a glance.

   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { attentionItems, attentionRowAction, ATTENTION_PRIORITY } from '../src/lib/homeData'
import { ROUTES } from '../src/lib/routes'

const now = new Date(2026, 6, 21, 12, 0, 0) // local 2026-07-21 noon
const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString()
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/* Lights up several rules at once, deliberately spanning the urgency range:
   a lead awaiting approval (15), a follow-up due today (20), pending money
   (35), an urgent task (50) and a client gone quiet (70). */
const data = {
  transactions: [{ id: 't1', status: 'pending', type: 'income', amount: 100 }],
  tasks: [{ id: 'k1', status: 'open', priority: 'high' }],
  leads: [
    { id: 'l1', name: 'מירב', pending_review: true },
    { id: 'l2', name: 'יונית', status_meta: 'in_process', follow_up_date: ymd(now) },
  ],
  clients: [{ id: 'c1', name: 'דנה', status_meta: 'active', created_at: daysAgo(200), sessions: 0, price_per_session: 0 }],
}

describe('attentionItems — ranked by urgency', () => {
  const items = attentionItems(now, data)
  const ids = items.map((i) => i.rowId)

  it('emits the rules this fixture triggers', () => {
    expect(ids).toContain('pendingLeads')
    expect(ids).toContain('dueFollowups')
    expect(ids).toContain('pendingTx')
    expect(ids).toContain('urgentTasks')
    expect(ids).toContain('staleClients')
  })

  it('returns them in ascending priority order', () => {
    const priorities = items.map((i) => i.priority)
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b))
  })

  it('puts what someone is waiting on above the coach\'s own follow-through', () => {
    /* A person who filled the form / a follow-up due today outrank an urgent
       task, which outranks a client who has simply gone quiet. */
    expect(ids.indexOf('pendingLeads')).toBeLessThan(ids.indexOf('urgentTasks'))
    expect(ids.indexOf('dueFollowups')).toBeLessThan(ids.indexOf('urgentTasks'))
    expect(ids.indexOf('urgentTasks')).toBeLessThan(ids.indexOf('staleClients'))
  })

  it('THE regression: money waiting for approval outranks a 45-day nudge', () => {
    expect(ids.indexOf('pendingTx')).toBeLessThan(ids.indexOf('staleClients'))
  })

  it('gives every row a numeric priority', () => {
    /* A rule added without one would sort to NaN and scramble the list
       silently — including the two rows the closed card summarises. */
    for (const it of items) {
      expect(typeof it.priority, `row "${it.rowId}" has a non-numeric priority`).toBe('number')
      expect(Number.isFinite(it.priority)).toBe(true)
    }
  })

  it('keeps every rowId in the priority map, and vice versa for the rule rows', () => {
    for (const it of items) {
      expect(ATTENTION_PRIORITY, `"${it.rowId}" is missing from ATTENTION_PRIORITY`).toHaveProperty(it.rowId)
      expect(it.priority).toBe(ATTENTION_PRIORITY[it.rowId])
    }
  })

  it('still resolves every row to a real action', () => {
    for (const it of items) {
      expect(attentionRowAction(it), `row "${it.rowId}" is a dead click`).not.toBeNull()
    }
  })
})

describe('attentionRowAction — the generic popup kind the widget rows use', () => {
  /* bookings / invoices / calendar-duplicates are built in AttentionWidget
     (they need hooks homeData has no access to) but ride the same list. */
  it('routes a popup row to its own target', () => {
    expect(attentionRowAction({ kind: 'popup', popup: 'bookings' })).toEqual({ type: 'popup', popup: 'bookings' })
    expect(attentionRowAction({ kind: 'popup', popup: 'invoices' })).toEqual({ type: 'popup', popup: 'invoices' })
    expect(attentionRowAction({ kind: 'popup', popup: 'duplicates' })).toEqual({ type: 'popup', popup: 'duplicates' })
  })

  it('does not treat a popup row with no target as actionable', () => {
    expect(attentionRowAction({ kind: 'popup' })).toBeNull()
  })

  it('leaves the older explicit kinds working', () => {
    expect(attentionRowAction({ kind: 'pendingTx', to: ROUTES.FINANCE })).toEqual({ type: 'popup', popup: 'tx' })
    expect(attentionRowAction({ kind: 'pendingMeetings', to: ROUTES.CALENDAR })).toEqual({ type: 'popup', popup: 'meetings' })
  })
})

describe('ATTENTION_PRIORITY — the ranking itself', () => {
  it('ranks the tiers in the intended order', () => {
    const p = ATTENTION_PRIORITY
    /* someone waiting → due today → blocks the books → own work → owed money
       → drifting relationships → housekeeping */
    expect(p.bookings).toBeLessThan(p.dueFollowups)
    expect(p.dueFollowups).toBeLessThan(p.pendingMeetings)
    expect(p.pendingTx).toBeLessThan(p.urgentTasks)
    expect(p.urgentTasks).toBeLessThan(p.balance)
    expect(p.balance).toBeLessThan(p.staleClients)
    expect(p.staleClients).toBeLessThan(p.goalGap)
  })

  it('has no duplicate ranks — ties would order arbitrarily', () => {
    const vals = Object.values(ATTENTION_PRIORITY)
    expect(new Set(vals).size).toBe(vals.length)
  })
})
