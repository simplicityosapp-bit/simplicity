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
