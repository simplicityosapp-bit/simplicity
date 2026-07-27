/* ════════════════════════════════════════════════════════════════
   ONBOARDING — every string the flow renders exists in all 4 languages.
   ════════════════════════════════════════════════════════════════
   Two whole surfaces were hardcoded Hebrew and nobody noticed, because
   nothing fails when a translation is simply absent — the app renders the
   Hebrew fallback and looks fine to a Hebrew-speaking reviewer:

     · the nine help panels (screens/onboarding/helpContent.js), and
     · the entire import UI — the "what's in this table?" picker and every
       column→field dropdown (lib/sheetMapper.js), which an en/es/fr user
       also meets in the in-app Settings import, not just onboarding.

   Both now resolve through i18n with the Hebrew as fallback. That fallback
   is what makes a gap invisible, so these assert the keys are actually
   there in all four languages rather than trusting the UI to look right.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { ONBOARDING_STEPS } from '../src/lib/preferences'
import { SHEET_TYPES, ENTITY_FIELDS } from '../src/lib/sheetMapper'

/* Relative, not '@simplicity/core/...' — the package's exports field only
   publishes its entry points, so the locale JSONs aren't reachable by
   specifier. */
import he from '../../../packages/core/src/i18n/locales/he/onboarding.json'
import en from '../../../packages/core/src/i18n/locales/en/onboarding.json'
import es from '../../../packages/core/src/i18n/locales/es/onboarding.json'
import fr from '../../../packages/core/src/i18n/locales/fr/onboarding.json'

const LOCALES = { he, en, es, fr }
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0

describe.each(Object.entries(LOCALES))('onboarding namespace — %s', (lang, ns) => {
  it('has a help panel for every step of the flow', () => {
    const steps = ns.help?.steps || {}
    for (const step of ONBOARDING_STEPS) {
      const panel = steps[step]
      expect(panel, `${lang}: help.steps.${step}`).toBeTruthy()
      expect(nonEmpty(panel.title), `${lang}: help.steps.${step}.title`).toBe(true)
      expect(Array.isArray(panel.paragraphs) && panel.paragraphs.length > 0, `${lang}: help.steps.${step}.paragraphs`).toBe(true)
      panel.paragraphs.forEach((p, i) => expect(nonEmpty(p), `${lang}: help.steps.${step}.paragraphs[${i}]`).toBe(true))
    }
  })

  it('names and explains every sheet type the picker offers', () => {
    for (const type of SHEET_TYPES) {
      expect(nonEmpty(ns.sheet?.types?.[type]), `${lang}: sheet.types.${type}`).toBe(true)
      expect(nonEmpty(ns.sheet?.typeHelp?.[type]), `${lang}: sheet.typeHelp.${type}`).toBe(true)
    }
  })

  it('labels every column→field option, for every entity', () => {
    for (const [entity, defs] of Object.entries(ENTITY_FIELDS)) {
      for (const f of defs) {
        expect(nonEmpty(ns.sheet?.fields?.[entity]?.[f.key]), `${lang}: sheet.fields.${entity}.${f.key}`).toBe(true)
      }
    }
  })
})

describe('onboarding namespace — no leftovers', () => {
  it('carries no key the other languages lack', () => {
    /* Paths of every leaf under the blocks these fixes added. A key added
       to one language only would otherwise sit unnoticed until a user in
       another language hit that exact screen. */
    const leaves = (obj, prefix = '') => Object.entries(obj || {}).flatMap(([k, v]) =>
      (v && typeof v === 'object' && !Array.isArray(v)) ? leaves(v, `${prefix}${k}.`) : [`${prefix}${k}`])

    const shape = (ns) => [...leaves(ns.help?.steps, 'help.steps.'), ...leaves(ns.sheet?.types, 'sheet.types.'), ...leaves(ns.sheet?.typeHelp, 'sheet.typeHelp.'), ...leaves(ns.sheet?.fields, 'sheet.fields.')].sort()

    const reference = shape(he)
    for (const [lang, ns] of Object.entries(LOCALES)) {
      expect(shape(ns), `${lang} differs from he`).toEqual(reference)
    }
  })
})
