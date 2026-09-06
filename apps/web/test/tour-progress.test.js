/* ════════════════════════════════════════════════════════════════
   A TOUR STEP THAT COULD NOT RUN IS OWED, NOT FORGOTTEN.
   ════════════════════════════════════════════════════════════════
   The finance screen opens a new account in a first-run state with no
   chart, no breakdown and no list. Its tour looked for those, found only
   the "+" button, ran that one step, and marked the whole screen seen —
   so the four steps that explain the screen never ran for anyone who
   arrived before their first transaction. Progress is per step now; these
   pin the rules that make that true.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { pendingSteps, recordShown } from '../src/lib/tourProgress'

const DEF = [{ target: '.chart' }, { target: '.list' }, { target: '.cta-add' }]

describe('pendingSteps', () => {
  it('owes every step before anything was shown', () => {
    expect(pendingSteps(DEF, undefined)).toEqual(DEF)
    expect(pendingSteps(DEF, null)).toEqual(DEF)
    expect(pendingSteps(DEF, { shown: [] })).toEqual(DEF)
  })

  it('owes nothing on a retired screen', () => {
    expect(pendingSteps(DEF, true)).toEqual([])
  })

  it('owes only the steps not yet shown, in tour order', () => {
    expect(pendingSteps(DEF, { shown: ['.cta-add'] })).toEqual([{ target: '.chart' }, { target: '.list' }])
    expect(pendingSteps(DEF, { shown: ['.list', '.chart'] })).toEqual([{ target: '.cta-add' }])
  })

  it('has nothing to say about a screen with no tour', () => {
    expect(pendingSteps(null, undefined)).toEqual([])
  })
})

describe('recordShown', () => {
  it('keeps a partial tour partial', () => {
    expect(recordShown(undefined, DEF, ['.cta-add'])).toEqual({ shown: ['.cta-add'] })
  })

  it('accumulates across visits', () => {
    const afterFirst = recordShown(undefined, DEF, ['.cta-add'])
    expect(recordShown(afterFirst, DEF, ['.chart'])).toEqual({ shown: ['.cta-add', '.chart'] })
  })

  it('retires the screen the moment the last step is shown', () => {
    expect(recordShown({ shown: ['.cta-add', '.chart'] }, DEF, ['.list'])).toBe(true)
    expect(recordShown(undefined, DEF, ['.chart', '.list', '.cta-add'])).toBe(true)
  })

  it('never un-retires a screen', () => {
    expect(recordShown(true, DEF, ['.chart'])).toBe(true)
  })

  it('is idempotent — acknowledging twice records once', () => {
    const once = recordShown(undefined, DEF, ['.chart'])
    expect(recordShown(once, DEF, ['.chart'])).toEqual(once)
  })

  it('the first-run finance case: the "+" now, the other steps on a later visit', () => {
    const firstVisit = recordShown(undefined, DEF, ['.cta-add'])
    expect(pendingSteps(DEF, firstVisit).map((s) => s.target)).toEqual(['.chart', '.list'])
    const secondVisit = recordShown(firstVisit, DEF, ['.chart', '.list'])
    expect(secondVisit).toBe(true)
    expect(pendingSteps(DEF, secondVisit)).toEqual([])
  })
})

/* The registry lives in a module that imports i18n and four locale JSONs,
   which would drag half the app into a plain-node test — read the tours out
   of the source instead, the way coachmark-copy.test.js reads its registry. */
const toursFromSource = () => {
  const src = readFileSync('src/lib/tours.js', 'utf8')
  const tours = {}
  for (const m of src.matchAll(/const (\w+_TOUR) = \[([\s\S]*?)\n\]/g)) {
    tours[m[1]] = [...m[2].matchAll(/target:\s*'([^']+)'/g)].map((t) => t[1])
  }
  return tours
}

describe('tour definitions', () => {
  it('finds the tours in the source', () => {
    expect(Object.keys(toursFromSource()).length).toBeGreaterThan(3)
  })

  it('never reuses a selector within one screen — the selector is the progress key', () => {
    const dupes = []
    for (const [name, targets] of Object.entries(toursFromSource())) {
      const seen = new Set()
      for (const t of targets) {
        if (seen.has(t)) dupes.push(`${name}: ${t}`)
        seen.add(t)
      }
    }
    expect(dupes, 'two steps sharing a target would be recorded as one').toEqual([])
  })
})
