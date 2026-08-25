/* ════════════════════════════════════════════════════════════════
   PROJECT SCOPING — one rule, four screens.
   ════════════════════════════════════════════════════════════════
   A row reaches a project two ways: tagged to it (project_id), or owned
   by a CLIENT who sits in it. The precedence is the part that kept
   getting lost — an explicit project_id WINS, and the client fallback
   applies only to rows carrying no project_id of their own.

   That guard lived in the projects-list card alone. The project screen,
   its income chart and the mobile twin each re-derived the rule WITHOUT
   it, so:

     · a tx tagged to project B whose client sits in project A was
       counted in BOTH projects' "הכנסה החודש" — and in neither card;
     · the tasks section dropped the client fallback entirely, so a card
       reading "3 משימות" opened onto a section reading none.

   These pin the rule itself, and then pin that all four call sites
   actually route through it rather than hand-rolling the filter again.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { belongsToProject, projectClientIdSet, scopeToProject } from '@simplicity/core'

const A = 'proj-a'
const B = 'proj-b'
const CLIENTS = [
  { id: 'c1', project_id: A },
  { id: 'c2', project_id: A },
  { id: 'c3', project_id: B },
  { id: 'c4', project_id: null },
]
const idsA = projectClientIdSet(CLIENTS, A)
const idsB = projectClientIdSet(CLIENTS, B)

describe('projectClientIdSet', () => {
  it('collects only the clients of the given project', () => {
    expect([...idsA].sort()).toEqual(['c1', 'c2'])
    expect([...idsB]).toEqual(['c3'])
  })
  it('ignores clients with no project', () => {
    expect(idsA.has('c4')).toBe(false)
    expect(idsB.has('c4')).toBe(false)
  })
})

describe('belongsToProject', () => {
  it('counts a row tagged directly to the project', () => {
    expect(belongsToProject({ project_id: A, client_id: null }, A, idsA)).toBe(true)
  })

  it('counts an UNTAGGED row via its client', () => {
    expect(belongsToProject({ project_id: null, client_id: 'c1' }, A, idsA)).toBe(true)
  })

  /* The whole point. Without the guard this row lands in A (via client c1)
     AND in B (via its own tag) — one payment, counted twice. */
  it('does NOT fall back to the client when the row carries its own project_id', () => {
    const taggedElsewhere = { project_id: B, client_id: 'c1' }
    expect(belongsToProject(taggedElsewhere, A, idsA)).toBe(false)
    expect(belongsToProject(taggedElsewhere, B, idsB)).toBe(true)
  })

  it('rejects a row belonging to neither', () => {
    expect(belongsToProject({ project_id: null, client_id: 'c3' }, A, idsA)).toBe(false)
    expect(belongsToProject({ project_id: null, client_id: null }, A, idsA)).toBe(false)
  })

  it('is safe on missing rows and a missing project id', () => {
    expect(belongsToProject(null, A, idsA)).toBe(false)
    expect(belongsToProject(undefined, A, idsA)).toBe(false)
    expect(belongsToProject({ project_id: A }, '', idsA)).toBe(false)
  })
})

describe('scopeToProject', () => {
  const TX = [
    { id: 't1', project_id: A, client_id: null, amount: 100 },
    { id: 't2', project_id: null, client_id: 'c1', amount: 50 },
    { id: 't3', project_id: B, client_id: 'c1', amount: 999 },   // tagged elsewhere
    { id: 't4', project_id: null, client_id: 'c3', amount: 7 },  // untagged, c3 sits in B
    { id: 't5', project_id: null, client_id: null, amount: 3 },  // unattached
  ]

  it('keeps exactly the rows that belong, in order', () => {
    expect(scopeToProject(TX, A, idsA).map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('never counts one row for two projects', () => {
    const inA = scopeToProject(TX, A, idsA).map((t) => t.id)
    const inB = scopeToProject(TX, B, idsB).map((t) => t.id)
    expect(inA.filter((id) => inB.includes(id))).toEqual([])
    /* t3 is tagged to B even though its client sits in A; t4 is untagged and
       reaches B through client c3. Neither leaks into A. */
    expect(inB).toEqual(['t3', 't4'])
  })

  it('sums to the same total the card and the project screen both show', () => {
    expect(scopeToProject(TX, A, idsA).reduce((s, t) => s + t.amount, 0)).toBe(150)
  })
})

/* ── The call sites ────────────────────────────────────────────────
   Structural, not behavioural: each of these four files used to carry its
   own copy of the filter, and three of the four copies were wrong. Pin
   that they import the shared rule and no longer hand-roll it. */
describe('every project-scoped screen routes through the shared rule', () => {
  const SITES = [
    'apps/web/src/screens/projects/index.jsx',
    'apps/web/src/screens/project-detail/index.jsx',
    'apps/web/src/screens/project-detail/ProjectIncomeChart.jsx',
    'apps/mobile/src/screens/ProjectsScreen.js',
    'apps/mobile/src/screens/ProjectDetailScreen.js',
  ]

  SITES.forEach((rel) => {
    it(`${rel} imports the helper`, () => {
      const src = readFileSync(new URL(`../../../${rel}`, import.meta.url), 'utf8')
      expect(src).toMatch(/scopeToProject|belongsToProject/)
    })

    /* The exact shape that kept drifting back in. */
    it(`${rel} does not re-implement the filter inline`, () => {
      const src = readFileSync(new URL(`../../../${rel}`, import.meta.url), 'utf8')
      expect(src).not.toMatch(/project_id === (?:p\.id|id|projectId)\s*\|\|/)
    })
  })
})
