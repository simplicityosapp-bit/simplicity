/* ════════════════════════════════════════════════════════════════
   ADDING FROM INSIDE A PROJECT — the project is a SEED, not a lock.
   ════════════════════════════════════════════════════════════════
   Opening "משימה חדשה" / "לקוח/ה חדש" / "יעד חדש" from inside a project
   should pre-fill that project — and nothing more. The forms carry a
   visible, enabled project picker; whatever the user leaves in it is what
   must be saved.

   Three call sites did the opposite. They spread the payload and stamped
   the project on afterwards:

       onSave={async (payload) => addTask({ ...payload, project_id: id })}

   so the picker rendered, accepted a different project, and was discarded
   without a word. AddTransactionModal on the very same row already had the
   right shape (`defaults`), which is what made the divergence invisible —
   one of the six quick-add actions behaved, five did not.

   There is no DOM test runner in this app, so these are source assertions,
   the same shape guide-matches-the-app.test.js uses. They are cheap and
   they pin the exact expression that kept coming back.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

/* The forms that must accept a seeded project. */
const SEEDABLE = [
  'src/modals/AddTaskModal.jsx',
  'src/modals/AddClientModal.jsx',
  'src/modals/AddGoalModal.jsx',
]

/* The screens that open them from inside a project. */
const CALLERS = [
  'src/screens/project-detail/index.jsx',
  'src/screens/project-detail/ProjectQuickRow.jsx',
]

describe('the add-forms accept a seeded project', () => {
  SEEDABLE.forEach((rel) => {
    it(`${rel} takes an initialProject prop`, () => {
      expect(read(rel)).toMatch(/initialProject\s*=\s*''/)
    })

    /* A seed that never reaches the form's own state is decoration. */
    it(`${rel} seeds project_id from it`, () => {
      expect(read(rel)).toMatch(/project_id:\s*initialProject/)
    })
  })
})

describe('no caller overwrites the saved project', () => {
  CALLERS.forEach((rel) => {
    it(`${rel} does not stamp project_id over the payload`, () => {
      const src = read(rel)
      /* The exact shape: spread a payload, then override project_id. */
      expect(src).not.toMatch(/\.\.\.payload[^}]*project_id:/)
    })

    it(`${rel} passes the project as a seed instead`, () => {
      expect(read(rel)).toMatch(/initialProject=\{(?:id|projectId)\}/)
    })
  })
})

/* ── Deep-open ─────────────────────────────────────────────────────
   The leads section names a lead and reads as a link to it. It used to
   navigate to ROUTES.LEADS flat, dropping the user on the whole kanban to
   find that name again by eye — while the lead-PAGES row two sections
   below already passed an id in nav state and landed on the right page. */
describe('a lead row opens that lead, not the board', () => {
  it('project-detail passes the lead id in nav state', () => {
    const src = read('src/screens/project-detail/index.jsx')
    expect(src).toMatch(/navigate\(ROUTES\.LEADS, \{ state: \{ openLeadId: l\.id \} \}\)/)
    /* The bare form is what regressed before. */
    expect(src).not.toMatch(/navigate\(ROUTES\.LEADS\)/)
  })

  it('the leads screen reads it and derives the lead', () => {
    const src = read('src/screens/leads/index.jsx')
    expect(src).toMatch(/location\.state\?\.openLeadId/)
    expect(src).toMatch(/const openLead = editLead/)
    /* Derived, never written from an effect — the repo forbids setState in
       effects (react-hooks/set-state-in-effect) and useLeads may not have
       arrived on the first render. */
    expect(src).not.toMatch(/useEffect\([\s\S]{0,200}setEditLead/)
  })

  it('closing clears the deep link so it cannot re-derive open', () => {
    const src = read('src/screens/leads/index.jsx')
    expect(src).toMatch(/const closeLead = useCallback\(\(\) => \{ setEditLead\(null\); setDeepLinkLeadId\(null\) \}/)
    expect(src).toMatch(/onClose=\{closeLead\}/)
  })

  it('the accessible name no longer promises the leads SCREEN', () => {
    const he = JSON.parse(readFileSync(
      new URL('../../../packages/core/src/i18n/locales/he/projects.json', import.meta.url), 'utf8',
    ))
    expect(he.detail.leads.openAria).not.toContain('מסך')
    expect(he.detail.leads.openAria).toContain('{{name}}')
  })
})

describe('the add-client form inside a project offers real statuses', () => {
  /* It passed statuses={[]} — the one add-client form in the app with no
     sub-status to pick, while the quick-add row on the SAME screen had them. */
  it('project-detail does not hand the client form an empty status list', () => {
    expect(read('src/screens/project-detail/index.jsx')).not.toMatch(/statuses=\{\[\]\}/)
  })

  it('project-detail reads the client statuses', () => {
    expect(read('src/screens/project-detail/index.jsx')).toMatch(/useClientStatuses/)
  })
})
