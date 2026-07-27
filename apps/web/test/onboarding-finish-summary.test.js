/* ════════════════════════════════════════════════════════════════
   ONBOARDING — "מה הגדרנו יחד" counts what we actually set up.
   ════════════════════════════════════════════════════════════════
   The closing step listed whole-account totals under that heading. On a
   brand-new account those are the same number, which is exactly why it
   went unnoticed — and why it needs a test rather than a look. They stop
   being the same the moment the account isn't new: someone re-running
   onboarding from Settings was shown their entire client list back as if
   this flow had just created it.

   Each step records the ids it created, so the summary counts those,
   intersected with the rows still live (step 4 lets a client be taken
   back out after it was added).
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'

/* Summary counting, copied from screens/onboarding/steps/Step9Finish.jsx —
   the component pulls five data hooks, which this DOM-less suite can't
   mount (see empty-states.test.js for the same trade). */
const idSet = (v) => new Set((Array.isArray(v) ? v : []).filter(Boolean))
const mine = (rows, ids) => (rows || []).filter((r) => ids.has(r.id)).length

const buildSummary = ({ answers = {}, projects = [], clients = [], goals = [], questions = [], recurring = [] }) => {
  const questionIds = idSet([...(answers.daily_questions?.question_ids || []), answers.goals?.question_id])
  return [
    { key: 'projects',  count: mine(projects, idSet(answers.projects?.created_ids)) },
    { key: 'clients',   count: mine(clients, idSet(answers.clients?.created_ids)) },
    { key: 'goals',     count: mine(goals, idSet(answers.goals?.created_ids)) },
    { key: 'questions', count: mine((questions || []).filter((q) => q.active !== false), questionIds) },
    { key: 'recurring', count: mine(recurring, idSet(answers.recurring?.created_ids)) },
  ].filter((s) => s.count > 0)
}

const countOf = (summary, key) => summary.find((s) => s.key === key)?.count ?? 0

describe('step 9 summary', () => {
  it('counts what this run created, not what the account holds', () => {
    /* The re-run case: a working account, onboarding started again from
       Settings, one new client added along the way. */
    const summary = buildSummary({
      answers: { clients: { created_ids: ['new'] } },
      clients: [{ id: 'old-1' }, { id: 'old-2' }, { id: 'old-3' }, { id: 'new' }],
    })
    expect(countOf(summary, 'clients')).toBe(1)
  })

  it('drops a row that was added and then removed again', () => {
    /* Step 4's remove button deletes the client and rewrites created_ids;
       if either half were missed the count would over-report. */
    const summary = buildSummary({
      answers: { clients: { created_ids: ['a'] } },
      clients: [{ id: 'a' }, { id: 'unrelated' }],
    })
    expect(countOf(summary, 'clients')).toBe(1)

    const afterRemoval = buildSummary({
      answers: { clients: { created_ids: [] } },
      clients: [{ id: 'unrelated' }],
    })
    expect(countOf(afterRemoval, 'clients')).toBe(0)
  })

  it('counts a goal-tracked daily question alongside the picked ones', () => {
    const summary = buildSummary({
      answers: { daily_questions: { question_ids: ['q1', 'q2'] }, goals: { question_id: 'qg' } },
      questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'qg' }, { id: 'preexisting' }],
    })
    expect(countOf(summary, 'questions')).toBe(3)
  })

  it('leaves out a question the user switched off', () => {
    /* Switching a goal back to manual tracking retires its question. */
    const summary = buildSummary({
      answers: { daily_questions: { question_ids: ['q1'] }, goals: { question_id: 'qg' } },
      questions: [{ id: 'q1' }, { id: 'qg', active: false }],
    })
    expect(countOf(summary, 'questions')).toBe(1)
  })

  it('shows no line for a step that was skipped', () => {
    const summary = buildSummary({
      answers: { projects: { created_ids: ['p1'] } },
      projects: [{ id: 'p1' }],
      clients: [{ id: 'someone' }],
      goals: [{ id: 'a-goal' }],
    })
    expect(summary.map((s) => s.key)).toEqual(['projects'])
  })

  it('shows nothing at all when every step was skipped', () => {
    /* Even on an account full of data — the empty-state copy is correct here. */
    expect(buildSummary({ answers: {}, clients: [{ id: 'x' }], goals: [{ id: 'y' }] })).toEqual([])
  })
})
