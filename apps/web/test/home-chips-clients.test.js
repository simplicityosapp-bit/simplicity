/* ════════════════════════════════════════════════════════════════
   HOME-CHIPS-CLIENTS SUITE — the לקוחות chip must agree with the
   clients screen (lib/homeData homeChips + clientInGroups).

   Two silent divergences are guarded here:

   1. STATUS. A group member's own `status_meta` column is stale — the
      canonical value is derived from their groups by effectiveClientMeta.
      homeChips read the raw column, so the home count could differ from
      the clients screen (and from the attention widget, which had already
      been fixed to use effectiveClientMeta).

   2. GROUP MEMBERSHIP. `clients.group_id` is a LEGACY mirror written only
      by the client form + lead conversion. Anyone assigned through the
      group roster (assignToGroup) exists ONLY as a `group_members` row, so
      filtering on the column alone dropped most of a group.

   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { homeChips, clientInGroups, attentionItems } from '../src/lib/homeData'

const now = new Date(2026, 6, 21, 12, 0, 0) // local 2026-07-21 noon
const countClients = (data, filters) => homeChips(now, data, filters).activeClients

describe('homeChips — the לקוחות count resolves status the same way the clients screen does', () => {
  const groups = [
    { id: 'g-live', status: 'active' },
    { id: 'g-done', status: 'ended' },
  ]

  it('counts a group member whose own status column went stale', () => {
    /* Own column says 'past'; the group they sit in is live, so the
       canonical status is 'active' and the default filter must count them. */
    const clients = [{ id: 'c1', name: 'דנה', status_meta: 'past' }]
    const members = [{ id: 'm1', client_id: 'c1', group_id: 'g-live' }]
    expect(countClients({ clients, members, groups })).toBe(1)
  })

  it('does NOT count a member whose only group has ended', () => {
    const clients = [{ id: 'c1', name: 'דנה', status_meta: 'active' }]
    const members = [{ id: 'm1', client_id: 'c1', group_id: 'g-done' }]
    expect(countClients({ clients, members, groups })).toBe(0)
  })

  it('lets a manual status override win over the group', () => {
    /* status_overridden = the coach took control (migration 0062). */
    const clients = [{ id: 'c1', name: 'דנה', status_meta: 'past', status_overridden: true }]
    const members = [{ id: 'm1', client_id: 'c1', group_id: 'g-live' }]
    expect(countClients({ clients, members, groups })).toBe(0)
  })

  it('leaves a non-member on their own stored status', () => {
    const clients = [
      { id: 'c1', name: 'דנה', status_meta: 'active' },
      { id: 'c2', name: 'רון', status_meta: 'past' },
    ]
    expect(countClients({ clients, members: [], groups })).toBe(1)
  })

  it('ignores a membership the client has already left', () => {
    const clients = [{ id: 'c1', name: 'דנה', status_meta: 'past' }]
    const members = [{ id: 'm1', client_id: 'c1', group_id: 'g-live', left_at: '2026-06-01' }]
    expect(countClients({ clients, members, groups })).toBe(0)
  })
})

describe('clientInGroups — membership is a group_members row, not the legacy mirror', () => {
  const members = [{ id: 'm1', client_id: 'roster', group_id: 'g1' }]

  it('matches a client linked ONLY through group_members (the roster path)', () => {
    /* No clients.group_id at all — this is the case that used to vanish. */
    expect(clientInGroups({ id: 'roster' }, ['g1'], members)).toBe(true)
  })

  it('still matches the legacy clients.group_id mirror (the client-form path)', () => {
    expect(clientInGroups({ id: 'legacy', group_id: 'g1' }, ['g1'], members)).toBe(true)
  })

  it('excludes a client in no selected group', () => {
    expect(clientInGroups({ id: 'other', group_id: 'g9' }, ['g1'], members)).toBe(false)
  })

  it('an empty selection means "no group filter", so everyone passes', () => {
    expect(clientInGroups({ id: 'other' }, [], members)).toBe(true)
    expect(clientInGroups({ id: 'other' }, undefined, members)).toBe(true)
  })

  it('drives the chip: a roster-only member is counted under a group filter', () => {
    const clients = [{ id: 'roster', name: 'דנה', status_meta: 'active' }]
    const filters = { clients: { statuses: ['active', 'wandering'], groupIds: ['g1'] } }
    expect(countClients({ clients, members, groups: [{ id: 'g1', status: 'active' }] }, filters)).toBe(1)
  })
})

describe('attentionItems — every row carries a unique, stable key', () => {
  /* The widget keys its rows on `rowId`. Two rules sharing an icon and
     rendering the same string used to collide on the old `icon + text` key. */
  const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString()
  const items = attentionItems(now, {
    transactions: [{ id: 't1', status: 'pending', type: 'income', amount: 100 }],
    tasks: [{ id: 'k1', status: 'open', priority: 'high' }],
    leads: [{ id: 'l1', name: 'מירב', pending_review: true }],
    clients: [{ id: 'c1', name: 'דנה', status_meta: 'active', created_at: daysAgo(200), sessions: 0, price_per_session: 0 }],
  })

  it('gives every emitted row a rowId', () => {
    expect(items.length).toBeGreaterThan(0)
    for (const it of items) expect(it.rowId, `row "${it.text}" has no rowId`).toBeTruthy()
  })

  it('never emits the same rowId twice', () => {
    const ids = items.map((it) => it.rowId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
