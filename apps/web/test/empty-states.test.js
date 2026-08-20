/* ════════════════════════════════════════════════════════════════
   EMPTY STATES — "nothing here yet" has to actually be true.
   ════════════════════════════════════════════════════════════════
   Both screens grew a first-run card that takes over the screen. Each one
   nearly shipped announcing an emptiness that wasn't real, in a way no
   type checker or lint rule would catch:

     · Leads — a public-page submission awaiting approval IS an enquiry,
       and it renders in its own card. Keying first-run on the approved
       leads alone showed that card and then "no enquiries here yet"
       directly beneath it.
     · Finance — staged invoice imports live in a separate table, so a
       user who connected a provider before recording anything has a queue
       while hasAnyTx is still false. Hiding the queue behind the empty
       state stranded exactly the migrating user it exists to help.

   These pin the conditions rather than the markup, which is what the
   DOM-less suite can actually assert.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { isPendingReview } from '@simplicity/core'

/* ── Leads, copied from screens/leads/index.jsx ─────────────────── */
const leadsFirstRun = ({ leads = [], loading = false, error = null, query = '', activeFilterCount = 0 } = {}) => {
  const pendingReview = leads.filter(isPendingReview)
  const officialLeads = leads.filter((l) => !isPendingReview(l))
  return !loading && !error
    && officialLeads.length === 0 && pendingReview.length === 0
    && query.trim() === '' && activeFilterCount === 0
}

const lead = (over = {}) => ({ id: '1', name: 'דנה', status_meta: 'in_process', ...over })

describe('the leads first-run card', () => {
  it('shows for a genuinely empty board', () => {
    expect(leadsFirstRun({ leads: [] })).toBe(true)
  })

  it('does NOT show when an enquiry is awaiting approval', () => {
    /* The regression: the pending card renders above it, so this would have
       been "here is an enquiry" followed by "no enquiries here yet". */
    expect(leadsFirstRun({ leads: [lead({ pending_review: true })] })).toBe(false)
  })

  it('does NOT show when leads exist', () => {
    expect(leadsFirstRun({ leads: [lead()] })).toBe(false)
  })

  it('does NOT hijack an empty SEARCH — that is a different situation', () => {
    expect(leadsFirstRun({ leads: [], query: 'דנה' })).toBe(false)
    expect(leadsFirstRun({ leads: [], query: '   ' })).toBe(true)
  })

  it('does NOT hijack an empty FILTER result either', () => {
    expect(leadsFirstRun({ leads: [], activeFilterCount: 1 })).toBe(false)
  })

  it('waits for the data — never flashes during load or after an error', () => {
    expect(leadsFirstRun({ leads: [], loading: true })).toBe(false)
    expect(leadsFirstRun({ leads: [], error: 'boom' })).toBe(false)
  })
})

/* ── Finance, copied from screens/finance/index.jsx ─────────────── */
const financeFirstRun = ({ transactions = [], loading = false, error = null } = {}) => {
  const hasAnyTx = transactions.some((tx) => !tx.deleted_at)
  return !loading && !error && !hasAnyTx
}

describe('the finance first-run card', () => {
  it('shows only when nothing has ever been recorded', () => {
    expect(financeFirstRun({ transactions: [] })).toBe(true)
    expect(financeFirstRun({ transactions: [{ id: '1' }] })).toBe(false)
  })

  it('treats a soft-deleted row as nothing', () => {
    expect(financeFirstRun({ transactions: [{ id: '1', deleted_at: '2026-07-01' }] })).toBe(true)
  })

  it('counts a PENDING transaction as something', () => {
    /* Pending rows are transactions, so hasAnyTx already covers them — unlike
       the invoice queue, which lives in another table entirely. */
    expect(financeFirstRun({ transactions: [{ id: '1', status: 'pending' }] })).toBe(false)
  })

  it('waits for the data', () => {
    expect(financeFirstRun({ transactions: [], loading: true })).toBe(false)
    expect(financeFirstRun({ transactions: [], error: 'boom' })).toBe(false)
  })
})

/* ── מבט על, copied from hooks/use*.js + screens/moon-glance/index.jsx ── */
/* The screen reads nine feeds and, until this fix, showed one thing when the
   score came back null: "עדיין אין יעדים". Two different states landed there
   wrongly — a read still in flight, and a read that never ran at all (React
   Query parks a fetch it believes is offline at fetchStatus 'paused', which
   reports NO error and isLoading false). Both told a coach their practice had
   no goals. Pinned as conditions, in the order the screen evaluates them. */
const feedState = ({ data, isLoading = false, error = null, fetchStatus = 'idle' } = {}) => ({
  loading: isLoading,
  unreachable: !!error || (fetchStatus === 'paused' && data === undefined),
  error: error?.message ?? null,
})

const moonBranch = (feeds, overall) => {
  const loading = feeds.some((q) => q.loading)
  const unreachable = feeds.some((q) => q.unreachable)
  if (loading) return 'loading'
  if (unreachable) return 'unreachable'
  if (!overall) return 'no-goals'
  return 'score'
}

const settled = feedState({ data: [] })
const score = { pure: 40, paced: 90, confidence: 90 }

describe('the מבט על hook feeds', () => {
  it('marks a parked (offline) read unreachable, though it has no error and is not loading', () => {
    const parked = feedState({ data: undefined, fetchStatus: 'paused' })
    expect(parked.loading).toBe(false)
    expect(parked.error).toBe(null)
    expect(parked.unreachable).toBe(true)
  })

  it('marks a failed read unreachable', () => {
    expect(feedState({ data: undefined, error: new Error('boom') }).unreachable).toBe(true)
  })

  it('does NOT mark a parked read unreachable once cached rows exist', () => {
    /* Offline with a warm cache is a usable screen, not a broken one. */
    expect(feedState({ data: [], fetchStatus: 'paused' }).unreachable).toBe(false)
  })

  it('leaves a settled read alone', () => {
    expect(feedState({ data: [] })).toEqual({ loading: false, unreachable: false, error: null })
  })
})

describe('the מבט על empty state', () => {
  it('says "no goals" only once every feed has settled', () => {
    expect(moonBranch([settled, settled], null)).toBe('no-goals')
  })

  it('does NOT claim "no goals" while a feed is still loading', () => {
    /* The regression: this was the first paint of every visit. */
    expect(moonBranch([feedState({ isLoading: true }), settled], null)).toBe('loading')
  })

  it('does NOT claim "no goals" when a feed never ran', () => {
    expect(moonBranch([feedState({ data: undefined, fetchStatus: 'paused' }), settled], null)).toBe('unreachable')
  })

  it('does NOT show a score computed from a half-loaded bag', () => {
    /* Goals arrived, transactions did not — the ring would render a real
       number built on missing income, and the effect would write it to
       moon_snapshots as that day's permanent history. */
    expect(moonBranch([settled, feedState({ isLoading: true })], score)).toBe('loading')
    expect(moonBranch([settled, feedState({ data: undefined, fetchStatus: 'paused' })], score)).toBe('unreachable')
  })

  it('shows the score when everything settled and goals exist', () => {
    expect(moonBranch([settled, settled], score)).toBe('score')
  })
})
