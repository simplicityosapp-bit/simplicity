/* ════════════════════════════════════════════════════════════════
   INCOME, EXPENSES, NET — counted the same way or not at all.
   ════════════════════════════════════════════════════════════════
   The project screen showed revenue alone, so "is this project worth it"
   was a question it could not answer.

   The rule that matters: expenses must be scoped EXACTLY as income is —
   tagged to the project, or (only when untagged) to one of its clients.
   If the two sides used different rules the difference between them would
   not be a number that means anything, and it would be presented as the
   project's profit.

   The second rule: one toggle scopes all three. A net built from a month
   of income against a lifetime of costs is worse than showing no net.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { scopeToProject } from '@simplicity/core'

const src = readFileSync(new URL('../src/screens/project-detail/index.jsx', import.meta.url), 'utf8')

describe('both sides of the ledger are scoped the same way', () => {
  it('income and expenses go through one scoping call', () => {
    /* A single `sum(type)` closure, so the two can never drift apart. */
    expect(src).toMatch(/const sum = \(type\) => scopeToProject\(/)
    expect(src).toMatch(/const income = sum\('income'\)/)
    expect(src).toMatch(/const expense = sum\('expense'\)/)
  })

  it('net is the difference, not a separately-derived figure', () => {
    expect(src).toMatch(/net: income - expense/)
  })

  it('one range feeds all three', () => {
    /* `range` is computed once from incomeScope and spread into every
       financeQuery, so the toggle cannot move one side only. */
    expect(src).toMatch(/const range = incomeScope === 'monthly' \? currentMonthRange\(\) : \{\}/)
    expect(src).toMatch(/financeQuery\(\{ type, \.\.\.range, source: transactions \}\)/)
  })
})

describe('the scoping rule itself', () => {
  /* Same helper the income path uses — proving here that it behaves
     identically whatever the transaction type is. */
  const CLIENTS = new Set(['c1'])
  const rows = [
    { id: 'a', project_id: 'p1', amount: 100 },                  // tagged here
    { id: 'b', project_id: 'p2', client_id: 'c1', amount: 50 },  // tagged elsewhere
    { id: 'c', client_id: 'c1', amount: 30 },                    // untagged, our client
    { id: 'd', client_id: 'c9', amount: 7 },                     // someone else's
  ]

  it('counts tagged rows and untagged rows of our clients', () => {
    expect(scopeToProject(rows, 'p1', CLIENTS).map((r) => r.id)).toEqual(['a', 'c'])
  })

  /* The guard that keeps a project's costs from being double-counted the
     way its income once was. */
  it('does NOT claim a row tagged to another project', () => {
    expect(scopeToProject(rows, 'p1', CLIENTS).some((r) => r.id === 'b')).toBe(false)
  })
})

describe('what the card shows', () => {
  it('flags a negative net and nothing else', () => {
    /* Income and expenses always carry their own colour; net stays in the
       primary ink until it goes below zero, which is the one figure here
       worth alarming about. */
    expect(src).toMatch(/money\.net < 0 \? ' pd-money-neg' : ''/)
    expect(src).toMatch(/pd-money-in/)
    expect(src).toMatch(/pd-money-out/)
  })

  it('does not repeat income in the stats card above it', () => {
    /* The stats card lost its income column when the money card arrived —
       the same figure in two places, moving together, is a bug waiting to
       happen. */
    const statsBlock = src.slice(src.indexOf('pd-stats pd-stats-2'), src.indexOf('pd-money'))
    expect(statsBlock).not.toMatch(/isr\(/)
  })
})

describe('the copy resolves in all four languages', () => {
  const load = (lang) => JSON.parse(readFileSync(
    new URL(`../../../packages/core/src/i18n/locales/${lang}/projects.json`, import.meta.url), 'utf8',
  ))

  it('labels all three figures', () => {
    for (const lang of ['he', 'en', 'es', 'fr']) {
      const s = load(lang).detail.stats
      for (const key of ['income', 'expenses', 'net']) {
        expect(s[key], `${lang}:stats.${key}`).toBeTruthy()
      }
    }
  })
})
