/* ════════════════════════════════════════════════════════════════
   FINDING ONE PROJECT AMONG MANY.
   ════════════════════════════════════════════════════════════════
   The list was ordered by created_at and nothing else, so past a handful
   of projects the only way to reach a specific one was by eye.

   Search follows the shape the leads board and the finance screen already
   share: lowercase both sides, split on whitespace, EVERY term must match.
   That last rule is the one worth pinning — a search where a second word
   widens the result set is worse than no search, because it looks like it
   is working.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { matchProject, sortProjectCards, PROJECT_SORTS } from '@simplicity/core'

describe('search', () => {
  const p = (name) => ({ name })

  it('matches on a substring, not just a prefix', () => {
    expect(matchProject(p('סדנאות קבוצתיות'), 'קבוצ')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(matchProject(p('Morning Circle'), 'morning')).toBe(true)
    expect(matchProject(p('morning circle'), 'MORNING')).toBe(true)
  })

  /* The rule that makes a second word useful rather than harmful. */
  it('requires EVERY term, so more words narrow', () => {
    expect(matchProject(p('סדנאות קבוצתיות'), 'סדנאות קבוצתיות')).toBe(true)
    expect(matchProject(p('סדנאות קבוצתיות'), 'סדנאות פרטני')).toBe(false)
  })

  it('ignores surrounding and repeated whitespace', () => {
    expect(matchProject(p('טיפול פרטני'), '  טיפול   פרטני  ')).toBe(true)
  })

  it('an empty query matches everything', () => {
    expect(matchProject(p('anything'), '')).toBe(true)
    expect(matchProject(p('anything'), '   ')).toBe(true)
  })

  it('does not throw on a project with no name', () => {
    expect(matchProject({}, 'x')).toBe(false)
    expect(matchProject(null, 'x')).toBe(false)
    expect(matchProject(null, '')).toBe(true)
  })
})

describe('sort', () => {
  const card = (name, created_at, income, clientsCount) => ({
    project: { name, created_at }, income, clientsCount,
  })
  const CARDS = [
    card('בטא', '2026-01-01', 100, 5),
    card('אלפא', '2026-03-01', 300, 1),
    card('גמא', '2026-02-01', 300, 9),
  ]
  const names = (out) => out.map((c) => c.project.name)

  it('recent is newest first — the behaviour that already existed', () => {
    expect(names(sortProjectCards(CARDS, 'recent'))).toEqual(['אלפא', 'גמא', 'בטא'])
  })

  it('name sorts with Hebrew collation', () => {
    expect(names(sortProjectCards(CARDS, 'name'))).toEqual(['אלפא', 'בטא', 'גמא'])
  })

  it('income and clients sort high to low', () => {
    expect(names(sortProjectCards(CARDS, 'income'))[0]).not.toBe('בטא')
    expect(names(sortProjectCards(CARDS, 'clients'))).toEqual(['גמא', 'בטא', 'אלפא'])
  })

  /* Without a tiebreak the order would depend on however the rows arrived,
     so the same list could shuffle between renders. */
  it('breaks ties by name rather than leaving them to chance', () => {
    expect(names(sortProjectCards(CARDS, 'income'))).toEqual(['אלפא', 'גמא', 'בטא'])
  })

  it('does not mutate the input', () => {
    const before = names(CARDS)
    sortProjectCards(CARDS, 'name')
    expect(names(CARDS)).toEqual(before)
  })

  it('an unknown sort key falls back to recent instead of throwing', () => {
    expect(names(sortProjectCards(CARDS, 'nonsense'))).toEqual(names(sortProjectCards(CARDS, 'recent')))
  })

  it('survives missing numbers', () => {
    const sparse = [{ project: { name: 'x' } }, { project: { name: 'y' }, income: 5 }]
    expect(() => sortProjectCards(sparse, 'income')).not.toThrow()
    expect(() => sortProjectCards(sparse, 'recent')).not.toThrow()
  })
})

describe('the screen wires it up', () => {
  const src = readFileSync(new URL('../src/screens/projects/index.jsx', import.meta.url), 'utf8')

  it('searches and sorts the SCOPED cards, not the raw list', () => {
    /* Order matters: the active/all filter is applied first, so a search
       inside "active" cannot surface a finished project. */
    expect(src).toMatch(/sortProjectCards\(scopedCards\.filter\(\(c\) => matchProject\(c\.project, query\)\), sort\)/)
  })

  it('holds the toolbar back until there is something to search through', () => {
    expect(src).toMatch(/const TOOLBAR_FROM = 6/)
    expect(src).toMatch(/projects\.length >= TOOLBAR_FROM/)
  })

  it('tells "nothing matched" apart from "nothing here"', () => {
    /* Same empty list, two different problems — one is fixed by clearing
       the query, the other by adding a project. */
    expect(src).toMatch(/visibleCards\.length === 0 && searching/)
    expect(src).toMatch(/empty\.noMatch/)
    expect(src).toMatch(/empty\.clearSearch/)
  })

  it('offers every sort the domain defines, from the domain', () => {
    /* A hardcoded list here would silently drop a new sort mode. */
    expect(src).toMatch(/PROJECT_SORTS\.map/)
  })
})

describe('the copy resolves in all four languages', () => {
  const load = (lang) => JSON.parse(readFileSync(
    new URL(`../../../packages/core/src/i18n/locales/${lang}/projects.json`, import.meta.url), 'utf8',
  ))

  it('has a label for every sort mode', () => {
    for (const lang of ['he', 'en', 'es', 'fr']) {
      const j = load(lang)
      expect(j.searchPlaceholder, `${lang}:searchPlaceholder`).toBeTruthy()
      expect(j.searchAria, `${lang}:searchAria`).toBeTruthy()
      expect(j.sort.aria, `${lang}:sort.aria`).toBeTruthy()
      for (const s of PROJECT_SORTS) {
        expect(j.sort[s], `${lang}:sort.${s}`).toBeTruthy()
      }
      expect(j.empty.noMatch, `${lang}:empty.noMatch`).toContain('{{query}}')
      expect(j.empty.clearSearch, `${lang}:empty.clearSearch`).toBeTruthy()
    }
  })
})
