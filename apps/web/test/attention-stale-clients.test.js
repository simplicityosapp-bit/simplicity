/* ════════════════════════════════════════════════════════════════
   STALE-CLIENTS SUITE — the 45-day rule behind the home "דרושה
   תשומת לב" row (lib/homeData.clientsNeedingAttention).

   Guards the three ways this rule went wrong in production:
     1. it read the legacy `clients.status` mirror instead of the
        canonical status_meta, so clients moved to «לשעבר» from the
        client drawer (which only ever wrote status_meta) kept being
        offered up as people to call;
     2. it ignored group-derived status entirely, so a member of an
        ended group counted as active;
     3. it had no dismiss, so a surfaced client could only be cleared
        by logging a session.
   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { clientsNeedingAttention } from '../src/lib/homeData'

const now = new Date(2026, 5, 25, 12, 0, 0) // local 2026-06-25 noon
const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString()

/* Old enough to be eligible, and never seen — the baseline "should
   surface" client. Individual tests override single fields. */
const base = { id: 'c1', name: 'דנה', status_meta: 'active', created_at: daysAgo(200) }
const ids = (res) => res.map((c) => c.id)

describe('clientsNeedingAttention — which clients surface', () => {
  it('surfaces an active client with no session ever recorded', () => {
    expect(ids(clientsNeedingAttention(45, now, { clients: [base] }))).toEqual(['c1'])
  })

  it('surfaces an active client whose last session predates the window', () => {
    const sessions = [{ id: 's1', client_id: 'c1', date: daysAgo(60) }]
    expect(ids(clientsNeedingAttention(45, now, { clients: [base], sessions }))).toEqual(['c1'])
  })

  it('drops a client seen inside the window', () => {
    const sessions = [
      { id: 's1', client_id: 'c1', date: daysAgo(60) },
      { id: 's2', client_id: 'c1', date: daysAgo(10) }, // most recent wins
    ]
    expect(clientsNeedingAttention(45, now, { clients: [base], sessions })).toEqual([])
  })

  it('drops a client created inside the window — too new to nag', () => {
    const fresh = { ...base, id: 'c2', created_at: daysAgo(10) }
    expect(clientsNeedingAttention(45, now, { clients: [fresh] })).toEqual([])
  })

  it('ignores soft-deleted clients and other clients’ sessions', () => {
    const clients = [{ ...base, deleted_at: daysAgo(3) }, { ...base, id: 'c2', name: 'יוסי' }]
    const sessions = [{ id: 's1', client_id: 'c1', date: daysAgo(2) }] // c1's, not c2's
    expect(ids(clientsNeedingAttention(45, now, { clients, sessions }))).toEqual(['c2'])
  })
})

describe('clientsNeedingAttention — status comes from status_meta, not the legacy mirror', () => {
  it('counts only active + wandering', () => {
    const clients = [
      { ...base, id: 'active', status_meta: 'active' },
      { ...base, id: 'wandering', status_meta: 'wandering' },
      { ...base, id: 'past', status_meta: 'past' },
      { ...base, id: 'none', status_meta: 'no_status' },
    ]
    expect(ids(clientsNeedingAttention(45, now, { clients }))).toEqual(['active', 'wandering'])
  })

  it('trusts status_meta over a stale `status` mirror left behind by the drawer', () => {
    /* The exact production shape: drawer moved them to «לשעבר» (status_meta),
       the legacy `status` column still says active. Must NOT surface. */
    const stale = { ...base, status_meta: 'past', status: 'active' }
    expect(clientsNeedingAttention(45, now, { clients: [stale] })).toEqual([])
  })

  it('falls back to `status` only when status_meta is absent', () => {
    const legacyOnly = { ...base, status_meta: undefined, status: 'active' }
    expect(ids(clientsNeedingAttention(45, now, { clients: [legacyOnly] }))).toEqual(['c1'])
  })
})

describe('clientsNeedingAttention — group-derived status', () => {
  const inGroup = { ...base, status_meta: 'active' }
  const members = [{ id: 'm1', client_id: 'c1', group_id: 'g1' }]

  it('drops a member whose only group has ended (group owns the lifecycle)', () => {
    const groups = [{ id: 'g1', status: 'ended' }]
    expect(clientsNeedingAttention(45, now, { clients: [inGroup], members, groups })).toEqual([])
  })

  it('keeps a member of a still-running group', () => {
    const groups = [{ id: 'g1', status: 'active' }]
    expect(ids(clientsNeedingAttention(45, now, { clients: [inGroup], members, groups }))).toEqual(['c1'])
  })

  it('lets a manual override win over the ended group', () => {
    const overridden = { ...inGroup, status_overridden: true, status_meta: 'active' }
    const groups = [{ id: 'g1', status: 'ended' }]
    expect(ids(clientsNeedingAttention(45, now, { clients: [overridden], members, groups }))).toEqual(['c1'])
  })

  it('ignores a membership the client has already left', () => {
    const left = [{ id: 'm1', client_id: 'c1', group_id: 'g1', left_at: daysAgo(30) }]
    const groups = [{ id: 'g1', status: 'ended' }]
    /* Left the ended group ⇒ back to their own status_meta ('active'). */
    expect(ids(clientsNeedingAttention(45, now, { clients: [inGroup], members: left, groups }))).toEqual(['c1'])
  })
})

describe('clientsNeedingAttention — "התעלם" snoozes rather than mutes', () => {
  it('hides a client dismissed inside the window', () => {
    const snoozed = { ...base, attention_snoozed_at: daysAgo(3) }
    expect(clientsNeedingAttention(45, now, { clients: [snoozed] })).toEqual([])
  })

  it('brings the client back once the dismissal itself ages out', () => {
    const snoozed = { ...base, attention_snoozed_at: daysAgo(60) }
    expect(ids(clientsNeedingAttention(45, now, { clients: [snoozed] }))).toEqual(['c1'])
  })

  it('does not let a dismissal resurrect a client who is no longer active', () => {
    const gone = { ...base, status_meta: 'past', attention_snoozed_at: daysAgo(60) }
    expect(clientsNeedingAttention(45, now, { clients: [gone] })).toEqual([])
  })
})
