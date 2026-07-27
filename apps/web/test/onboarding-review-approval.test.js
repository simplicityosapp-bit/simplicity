/* ════════════════════════════════════════════════════════════════
   ONBOARDING — the step-2 approval has to survive a trip backwards.
   ════════════════════════════════════════════════════════════════
   Step 2 opens the review wizard so the user can go through what we read
   out of their file and take rows OUT. That work is the point of the
   screen: on a 200-row spreadsheet the exclusions can be twenty minutes
   of reading. Pressing "חזרה" and then "הלאה" again used to rebuild the
   review from the raw sheets, silently re-including every row they had
   removed — and then overwrite the stored approval with the rebuilt one,
   so the loss was permanent and invisible.

   The fix keys the stored approval to a fingerprint of the sheets. These
   pin both halves of that decision: the same file restores the user's
   own selection, and a genuine remap invalidates it (those approved rows
   describe fields that no longer exist, so reusing them would import the
   wrong data — worse than asking again).
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { sheetsFingerprint } from '../src/lib/importFlow'

/* usableApproval, copied from screens/onboarding/index.jsx. */
const usableApproval = (pd) => {
  const approved = pd?.reviewed
  if (!approved) return null
  return approved.fingerprint === sheetsFingerprint(pd) ? approved : null
}

const sheet = (over = {}) => ({
  id: 's1',
  fileName: 'clients.xlsx',
  type: 'clients',
  mapping: { 0: 'name', 1: 'phone' },
  headers: ['שם', 'טלפון'],
  rows: [['דנה', '050'], ['יוסי', '052']],
  ...over,
})

/* The user approved 1 of the 2 clients the file yields. */
const approvalFor = (pd) => ({
  clients: [{ name: 'דנה' }],
  projects: [], leads: [], transactions: [], sessions: [],
  fingerprint: sheetsFingerprint(pd),
})

describe('step-2 approval survives going back', () => {
  it('restores the user selection when nothing about the file changed', () => {
    const pd = { sheets: [sheet()] }
    pd.reviewed = approvalFor(pd)
    expect(usableApproval(pd)?.clients).toEqual([{ name: 'דנה' }])
  })

  it('is unaffected by re-reading the same descriptors (no identity dependence)', () => {
    const pd = { sheets: [sheet()] }
    pd.reviewed = approvalFor(pd)
    const reloaded = { sheets: [sheet()], reviewed: pd.reviewed } /* fresh objects, e.g. after a page reload */
    expect(usableApproval(reloaded)).not.toBeNull()
  })

  it('drops the approval when a column is remapped', () => {
    const pd = { sheets: [sheet()] }
    pd.reviewed = approvalFor(pd)
    pd.sheets = [sheet({ mapping: { 0: 'name', 1: 'email' } })]
    expect(usableApproval(pd)).toBeNull()
  })

  it('drops the approval when a table is retyped', () => {
    const pd = { sheets: [sheet()] }
    pd.reviewed = approvalFor(pd)
    pd.sheets = [sheet({ type: 'leads' })]
    expect(usableApproval(pd)).toBeNull()
  })

  it('drops the approval when a table is removed, or a new file is added', () => {
    const pd = { sheets: [sheet()] }
    pd.reviewed = approvalFor(pd)

    const removed = { sheets: [sheet({ removed: true })], reviewed: pd.reviewed }
    expect(usableApproval(removed)).toBeNull()

    const added = { sheets: [sheet(), sheet({ id: 's2', type: 'transactions' })], reviewed: pd.reviewed }
    expect(usableApproval(added)).toBeNull()
  })

  it('tracks a matrix sheet\'s year and per-row income/expense choices', () => {
    const matrix = (over = {}) => sheet({
      id: 'm1', type: 'matrix',
      pivot: { year: 2025, labelCol: 0, rowTypes: { 1: 'income' }, skipRows: [3] },
      ...over,
    })
    const pd = { sheets: [matrix()] }
    pd.reviewed = approvalFor(pd)

    /* Same config, skipRows listed in another order — still the same data. */
    const reordered = { sheets: [matrix({ pivot: { year: 2025, labelCol: 0, rowTypes: { 1: 'income' }, skipRows: [3] } })], reviewed: pd.reviewed }
    expect(usableApproval(reordered)).not.toBeNull()

    /* A different year re-dates every transaction the sheet produces. */
    const reyeared = { sheets: [matrix({ pivot: { year: 2024, labelCol: 0, rowTypes: { 1: 'income' }, skipRows: [3] } })], reviewed: pd.reviewed }
    expect(usableApproval(reyeared)).toBeNull()

    /* Flipping a row from income to expense flips the sign of the money. */
    const reflipped = { sheets: [matrix({ pivot: { year: 2025, labelCol: 0, rowTypes: { 1: 'expense' }, skipRows: [3] } })], reviewed: pd.reviewed }
    expect(usableApproval(reflipped)).toBeNull()
  })

  it('has nothing to restore before the first approval', () => {
    expect(usableApproval({ sheets: [sheet()] })).toBeNull()
    expect(usableApproval(null)).toBeNull()
  })
})
