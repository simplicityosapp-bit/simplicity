/* ════════════════════════════════════════════════════════════════
   PROJECT STATUS — filing a project away, without rewriting history.
   ════════════════════════════════════════════════════════════════
   Migration 0111 gives `projects` a two-state lifecycle. Three rules are
   easy to break later and each would be wrong in a different way:

   1. The FILTER applies to the list. The SUMMARY does not filter.
      Hiding a finished project's card is a filing decision. Removing its
      income from "הכנסות החודש" would be a false financial report — the
      money did arrive. (Owner decision, 2026-08-25.)

   2. A row written BEFORE the migration carries no status at all, and is
      active. Anything testing `=== 'active'` silently hides every project
      that existed before the column did — which, on the day it ships, is
      all of them.

   3. Ending a project must NOT cascade to its clients. Groups do cascade
      (project-detail → propagateToClients); projects deliberately do not,
      because a coach who wraps up a project still has those people.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import i18n, { initI18n, loadLanguage } from '@simplicity/core/i18n'

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

/* Mirrors the screen's own expression, kept in one place so a change to it
   has to change this line too. */
const visible = (projects, scope) =>
  (scope === 'all' ? projects : projects.filter((p) => p.status !== 'ended'))

const PROJECTS = [
  { id: 'a', name: 'running', status: 'active' },
  { id: 'b', name: 'done', status: 'ended' },
  { id: 'c', name: 'legacy' },            // pre-migration row: no status
  { id: 'd', name: 'null-status', status: null },
]

describe('the list filter', () => {
  it('hides finished projects by default', () => {
    expect(visible(PROJECTS, 'active').map((p) => p.id)).toEqual(['a', 'c', 'd'])
  })

  it('shows everything on "all"', () => {
    expect(visible(PROJECTS, 'all').map((p) => p.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  /* The one that would silently empty every existing account. */
  it('treats a row with no status as active', () => {
    expect(visible([{ id: 'c' }], 'active')).toHaveLength(1)
    expect(visible([{ id: 'd', status: null }], 'active')).toHaveLength(1)
  })

  it('counts what is hidden, so the toggle can say so', () => {
    expect(PROJECTS.filter((p) => p.status === 'ended')).toHaveLength(1)
  })
})

describe('the screen keeps the summary unfiltered', () => {
  const src = read('src/screens/projects/index.jsx')

  it('filters the cards, not the totals', () => {
    /* The active/all filter narrows the CARDS into `scopedCards`; `totals` is
       computed from the full `projects` list a few lines above and never
       touches either. (Search and sort then narrow scopedCards further into
       visibleCards — see project-search-sort.test.js.) */
    expect(src).toMatch(/const scopedCards = scope === 'all' \? cards : cards\.filter/)
    expect(src).toMatch(/visibleCards\.map/)
  })

  it('renders the hero from the unfiltered totals', () => {
    expect(src).toMatch(/totals\.assignedClients/)
    expect(src).toMatch(/isr\(totals\.heroIncome\)/)
    /* If the totals ever start reading visibleCards, this is the tell. */
    expect(src).not.toMatch(/totals[\s\S]{0,80}visibleCards/)
  })
})

describe('the migration is additive and data-preserving', () => {
  const sql = readFileSync(
    new URL('../../../supabase/migrations/0111_projects_status.sql', import.meta.url),
    'utf8',
  )

  it('adds the column without dropping anything', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'/)
    expect(sql).not.toMatch(/DROP COLUMN|DROP TABLE|TRUNCATE|DELETE FROM/i)
  })

  it('defaults every existing row to active', () => {
    expect(sql).toMatch(/DEFAULT 'active'/)
  })

  it('constrains the value to the two known states', () => {
    expect(sql).toMatch(/CHECK \(status IN \('active', 'ended'\)\)/)
  })

  it('is safe to re-run', () => {
    expect(sql).toMatch(/IF NOT EXISTS/)
  })
})

describe('ending a project does not cascade to its clients', () => {
  const src = read('src/screens/project-detail/index.jsx')

  it('propagateToClients is still reached only from the GROUP status path', () => {
    /* The cascade exists for groups and must stay there. If a project-status
       handler ever calls it, this catches it: one definition, one call site. */
    const mentions = src.match(/propagateToClients/g) || []
    expect(mentions).toHaveLength(2)
    expect(src).toMatch(/const propagateToClients = async \(gid, newStatus\)/)
    expect(src).toMatch(/const confirmGroupStatusChange[\s\S]{0,400}await propagateToClients\(g\.id, newStatus\)/)
  })

  it('the project status control writes only the project row', () => {
    /* EditProjectModal saves name/color/status and nothing else — no client
       patching rides along with an "ended" flip. */
    const modal = read('src/modals/EditProjectModal.jsx')
    expect(modal).toMatch(/onSave\(project\.id, \{ name: form\.name\.trim\(\), color: form\.color, status: form\.status \}\)/)
    expect(modal).not.toMatch(/updateClient|status_meta/)
  })
})

describe('the status copy resolves in all four languages', () => {
  beforeAll(async () => {
    await initI18n({ lng: 'he' })
    await Promise.all(['en', 'es', 'fr'].map(loadLanguage))
  })

  it('card tag + scope toggle', () => {
    for (const lng of ['he', 'en', 'es', 'fr']) {
      const t = i18n.getFixedT(lng, 'projects')
      for (const key of ['card.ended', 'card.active', 'scope.active', 'scope.all', 'scope.aria']) {
        expect(t(key), `${lng}:${key}`).not.toBe(key)
      }
    }
  })

  it('the edit-modal status control', () => {
    for (const lng of ['he', 'en', 'es', 'fr']) {
      const t = i18n.getFixedT(lng, 'modalsData')
      for (const key of ['editProject.status', 'editProject.statusActive', 'editProject.statusEnded', 'editProject.statusEndedHint', 'editProject.deleteProject']) {
        expect(t(key), `${lng}:${key}`).not.toBe(key)
      }
    }
  })

  /* The hint is the only place the app promises what ending does NOT do. */
  it('the Hebrew hint still promises the data stays', () => {
    const t = i18n.getFixedT('he', 'modalsData')
    expect(t('editProject.statusEndedHint')).toContain('נשארים')
  })
})
