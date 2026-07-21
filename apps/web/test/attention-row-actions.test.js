/* ════════════════════════════════════════════════════════════════
   ATTENTION-ROW-ACTIONS SUITE — every row in the home "דרושה תשומת
   לב" widget must DO something when clicked (lib/homeData
   attentionRowAction + attentionItems).

   Guards the regression where a refactor pointed the widget handler at
   `it.target` while web's attentionItems() still emitted `it.to`, so all
   four navigating rows (balances, goal-gap, urgent tasks, pending leads)
   became dead clicks. The action decision now lives in one tested place;
   these cases fail the moment the handler and the data shape disagree.
   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { attentionItems, attentionRowAction } from '../src/lib/homeData'
import { ROUTES } from '../src/lib/routes'

describe('attentionRowAction — the item shapes attentionItems() actually emits', () => {
  it('opens the approve popup for the two actionable kinds', () => {
    expect(attentionRowAction({ kind: 'pendingTx', to: ROUTES.FINANCE }))
      .toEqual({ type: 'popup', popup: 'tx' })
    expect(attentionRowAction({ kind: 'pendingMeetings', to: ROUTES.CALENDAR }))
      .toEqual({ type: 'popup', popup: 'meetings' })
  })

  it('opens the people list for people rows', () => {
    expect(attentionRowAction({ kind: 'people', rowId: 'staleClients' }))
      .toEqual({ type: 'people' })
  })

  /* These four are the rows that went dead. Each carries only `to`
     (balances / goal-gap / urgent tasks) or `kind` + `to` (pending
     leads); all must navigate. */
  it('navigates the `to`-only rows — balances, goal-gap, urgent tasks', () => {
    expect(attentionRowAction({ to: ROUTES.CLIENTS })).toEqual({ type: 'navigate', to: ROUTES.CLIENTS })
    expect(attentionRowAction({ to: ROUTES.GOALS })).toEqual({ type: 'navigate', to: ROUTES.GOALS })
    expect(attentionRowAction({ to: ROUTES.TASKS })).toEqual({ type: 'navigate', to: ROUTES.TASKS })
  })

  it('navigates pending-leads (kind that is not a popup/people → falls through to its route)', () => {
    expect(attentionRowAction({ kind: 'pendingLeads', to: ROUTES.LEADS }))
      .toEqual({ type: 'navigate', to: ROUTES.LEADS })
  })

  it('also resolves the shared-core `target` shape, so web can adopt it without breaking', () => {
    expect(attentionRowAction({ target: 'clients' })).toEqual({ type: 'navigate', to: ROUTES.CLIENTS })
    expect(attentionRowAction({ target: 'goals' })).toEqual({ type: 'navigate', to: ROUTES.GOALS })
  })

  it('returns null only for a genuinely non-actionable row', () => {
    expect(attentionRowAction({})).toBeNull()
    expect(attentionRowAction({ target: 'bogus-key' })).toBeNull()
    expect(attentionRowAction(null)).toBeNull()
  })
})

describe('attentionItems — every emitted row is actionable end to end', () => {
  const now = new Date(2026, 5, 25, 12, 0, 0) // local 2026-06-25 noon
  const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString()

  /* A fixture that lights up one row of each action type: a pending
     transaction (popup), a lead awaiting approval (navigate), and a stale
     client (people). Kept deliberately free of prices / goals so no balance
     or goal-gap row muddies the set. The high-priority task is here on
     purpose and must NOT produce a row — the tasks widget owns those. */
  const data = {
    transactions: [{ id: 't1', status: 'pending', type: 'income', amount: 100 }],
    tasks: [{ id: 'k1', status: 'open', priority: 'high' }],
    leads: [{ id: 'l1', name: 'מירב', pending_review: true }],
    clients: [{ id: 'c1', name: 'דנה', status_meta: 'active', created_at: daysAgo(200), sessions: 0, price_per_session: 0 }],
  }

  const items = attentionItems(now, data)

  it('produces the three expected rows and NOTHING resolves to a dead click', () => {
    expect(items.length).toBe(3)
    for (const it of items) {
      expect(attentionRowAction(it), `row "${it.text}" (kind=${it.kind}) is a dead click`).not.toBeNull()
    }
  })

  it('routes each row to the right destination', () => {
    const action = (pred) => attentionRowAction(items.find(pred))
    expect(action((i) => i.kind === 'pendingTx')).toEqual({ type: 'popup', popup: 'tx' })
    expect(action((i) => i.rowId === 'staleClients')).toEqual({ type: 'people' })
    expect(action((i) => i.kind === 'pendingLeads')).toEqual({ type: 'navigate', to: ROUTES.LEADS })
  })

  it('raises no row for the high-priority task in the fixture', () => {
    expect(items.some((i) => i.to === ROUTES.TASKS)).toBe(false)
  })
})
