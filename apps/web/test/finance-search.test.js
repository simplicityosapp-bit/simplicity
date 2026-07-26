/* ════════════════════════════════════════════════════════════════
   TRANSACTION SEARCH — finding "what has Dana paid me".
   ════════════════════════════════════════════════════════════════
   The filter runs over the whole cached history, so the ways it can go
   wrong are all quiet ones: matching a deleted row, matching a client the
   row isn't linked to, or letting a number query match a substring in the
   middle of a bigger amount. These pin the behaviour the list depends on.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { searchTransactions, isSearchActive } from '../src/screens/finance/searchTransactions'

const clients = [
  { id: 'c1', name: 'דנה כהן' },
  { id: 'c2', name: 'Yossi Levi' },
]
const projects = [{ id: 'p1', name: 'ליווי אישי' }]
const categories = [{ id: 'k1', name: 'מנויים' }]

const rows = [
  { id: '1', date: '2026-07-10', amount: 300, type: 'income', desc: 'פגישה', client_id: 'c1' },
  { id: '2', date: '2026-03-02', amount: 1300, type: 'income', desc: 'סדנה', client_id: 'c1', project_id: 'p1' },
  { id: '3', date: '2026-05-20', amount: 89, type: 'expense', desc: 'זום', category_id: 'k1' },
  { id: '4', date: '2026-06-01', amount: 500, type: 'income', desc: 'ייעוץ', client_id: 'c2' },
  { id: '5', date: '2026-01-15', amount: 250, type: 'income', desc: 'קבלה', recipient_name: 'דנה לוי' },
  { id: '6', date: '2026-04-04', amount: 700, type: 'income', desc: 'מחוק', client_id: 'c1', deleted_at: '2026-04-05' },
]

const find = (opts) => searchTransactions(rows, { clients, projects, categories, ...opts }).map((r) => r.id)

describe('text matches what the row actually shows', () => {
  it('the description', () => {
    expect(find({ query: 'זום' })).toEqual(['3'])
  })

  it('the client name — including rows in other months', () => {
    /* The whole point: row 2 is in March, row 1 in July. */
    expect(find({ query: 'דנה' }).sort()).toEqual(['1', '2', '5'])
  })

  it('an ad-hoc recipient, who is not a client at all', () => {
    expect(find({ query: 'דנה לוי' })).toEqual(['5'])
  })

  it('the project', () => {
    expect(find({ query: 'ליווי' })).toEqual(['2'])
  })

  it('the category', () => {
    expect(find({ query: 'מנויים' })).toEqual(['3'])
  })

  it('is case-insensitive for the languages that have case', () => {
    expect(find({ query: 'yossi' })).toEqual(['4'])
    expect(find({ query: 'YOSSI' })).toEqual(['4'])
  })
})

describe('amounts', () => {
  it('a number finds the amount even though no text contains it', () => {
    expect(find({ query: '300' })).toEqual(['1'])
  })

  it('matches from the START of the amount, so 300 does not surface 1300', () => {
    /* Substring matching here would make every number query useless. */
    expect(find({ query: '300' })).not.toContain('2')
    expect(find({ query: '1300' })).toEqual(['2'])
  })

  it('ignores separators and currency marks', () => {
    expect(find({ query: '1,300' })).toEqual(['2'])
    expect(find({ query: '₪1300' })).toEqual(['2'])
  })
})

describe('multiple words narrow rather than widen', () => {
  it('every term has to match', () => {
    expect(find({ query: 'דנה סדנה' })).toEqual(['2'])
  })

  it('a name plus an amount', () => {
    expect(find({ query: 'דנה 300' })).toEqual(['1'])
  })

  it('a term that matches nothing kills the whole result', () => {
    expect(find({ query: 'דנה חתול' })).toEqual([])
  })
})

describe('the things it must never return', () => {
  it('deleted rows, even on an exact match', () => {
    expect(find({ query: 'מחוק' })).toEqual([])
    expect(find({ query: 'דנה' })).not.toContain('6')
  })

  it('rows of the wrong type when a chip is set', () => {
    expect(find({ type: 'expense' })).toEqual(['3'])
    expect(find({ query: 'דנה', type: 'expense' })).toEqual([])
  })
})

describe('ordering and defaults', () => {
  it('results come back newest first', () => {
    expect(find({ query: 'דנה' })).toEqual(['1', '2', '5'])
  })

  it('a blank query with no chip returns everything live, newest first', () => {
    expect(find({})).toEqual(['1', '4', '3', '2', '5'])
  })

  it('whitespace alone is not a query', () => {
    expect(find({ query: '   ' })).toEqual(find({}))
  })
})

describe('isSearchActive', () => {
  it('is false only when nothing is filtering', () => {
    expect(isSearchActive({})).toBe(false)
    expect(isSearchActive({ query: '  ', type: 'all' })).toBe(false)
    expect(isSearchActive({ query: 'x' })).toBe(true)
    expect(isSearchActive({ type: 'income' })).toBe(true)
  })
})

describe('degenerate input', () => {
  it('survives missing lookup tables', () => {
    /* Without clients/projects/categories only the row's own text is
       searchable, so the client link on row 1 can no longer be found. Row 2
       still matches — its description "סדנה" literally contains "דנה", which
       is substring matching working as intended, not a lookup. */
    expect(searchTransactions(rows, { query: 'דנה' }).map((r) => r.id)).toEqual(['2', '5'])
  })

  it('survives a null transaction list', () => {
    expect(searchTransactions(null, { query: 'x' })).toEqual([])
    expect(searchTransactions(undefined, {})).toEqual([])
  })
})
