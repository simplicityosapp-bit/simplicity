/* ════════════════════════════════════════════════════════════════
   ONBOARDING — every string exists in all 4 languages, and Hebrew
   addresses the user the way they asked to be addressed.
   ════════════════════════════════════════════════════════════════
   The import UI — the "what's in this table?" picker and every
   column→field dropdown — was hardcoded Hebrew, which an en/es/fr user
   also meets in the Settings import. It resolves through i18n now, with
   the Hebrew as fallback, and that fallback is exactly what made the gap
   invisible: nothing fails when a translation is simply absent.

   The second half is the form of address. useT applies the user's choice
   as an i18next context automatically, so a Hebrew string that speaks to
   the user needs a _male/_female pair or it silently addresses everyone
   in the same gender. A missing pair renders fine and reads wrong, so it
   has to be asserted rather than looked at.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { SHEET_TYPES, ENTITY_FIELDS } from '../src/lib/sheetMapper'

/* Relative, not '@simplicity/core/...' — the package's exports field only
   publishes its entry points, so the locale JSONs aren't reachable by
   specifier. */
import he from '../../../packages/core/src/i18n/locales/he/onboarding.json'
import en from '../../../packages/core/src/i18n/locales/en/onboarding.json'
import es from '../../../packages/core/src/i18n/locales/es/onboarding.json'
import fr from '../../../packages/core/src/i18n/locales/fr/onboarding.json'
import heSteps from '../../../packages/core/src/i18n/locales/he/onboardingSteps.json'
import enSteps from '../../../packages/core/src/i18n/locales/en/onboardingSteps.json'
import esSteps from '../../../packages/core/src/i18n/locales/es/onboardingSteps.json'
import frSteps from '../../../packages/core/src/i18n/locales/fr/onboardingSteps.json'

const LOCALES = { he, en, es, fr }
const STEP_LOCALES = { he: heSteps, en: enSteps, es: esSteps, fr: frSteps }
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0

describe.each(Object.entries(LOCALES))('onboarding namespace — %s', (lang, ns) => {
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

const leaves = (obj, prefix = '') => Object.entries(obj || {}).flatMap(([k, v]) =>
  (v && typeof v === 'object' && !Array.isArray(v)) ? leaves(v, `${prefix}${k}.`) : [`${prefix}${k}`])

/* Gendered variants are Hebrew-only by design (es/fr omit them — see the
   i18n memo), so they are stripped before comparing shapes. */
const base = (paths) => paths.filter((p) => !p.endsWith('_male') && !p.endsWith('_female')).sort()

describe('no language drifts from another', () => {
  it('carries the same import-UI keys everywhere', () => {
    const shape = (ns) => base([
      ...leaves(ns.sheet?.types, 'sheet.types.'),
      ...leaves(ns.sheet?.typeHelp, 'sheet.typeHelp.'),
      ...leaves(ns.sheet?.fields, 'sheet.fields.'),
    ])
    for (const [lang, ns] of Object.entries(LOCALES)) {
      expect(shape(ns), `${lang} differs from he`).toEqual(shape(he))
    }
  })

  it('carries the same step keys everywhere', () => {
    for (const [lang, ns] of Object.entries(STEP_LOCALES)) {
      expect(base(leaves(ns)), `${lang} differs from he`).toEqual(base(leaves(heSteps)))
    }
  })
})

describe('Hebrew form of address', () => {
  /* Second-person markers. The excluded patterns are real slashes between
     two nouns ("income/expense"), not dual-gender forms. */
  const SECOND_PERSON = /[֐-׿]\/[֐-׿]|\b(עברו|בחרו|סמנו|הזינו|לחצו|נסו|מלאו|הוסיפו|תוכל|תרצה)\b/
  const REAL_SLASH = /הכנסות\/הוצאות|סכום\/תאריך|הכנסה\/הוצאה|CSV\/|Excel\//

  /* Only the flow's own screens: welcome, the shell chrome, and the five
     steps. The import UI speaks in a deliberate plural register and lives
     in Settings now. */
  const flowCopy = () => {
    const out = []
    const walk = (obj, path) => {
      for (const [k, v] of Object.entries(obj || {})) {
        if (v && typeof v === 'object' && !Array.isArray(v)) { walk(v, `${path}${k}.`); continue }
        if (typeof v === 'string') out.push({ key: `${path}${k}`, value: v, parent: obj, name: k })
      }
    }
    walk({ welcome: he.welcome, shell: he.shell, common: he.common }, '')
    walk(heSteps, '')
    return out
  }

  it('gives every string that speaks to the user a male and a female form', () => {
    const missing = flowCopy()
      .filter(({ name, value }) => !name.endsWith('_male') && !name.endsWith('_female')
        && SECOND_PERSON.test(value) && !REAL_SLASH.test(value))
      .filter(({ parent, name }) => parent[`${name}_male`] === undefined || parent[`${name}_female`] === undefined)
      .map(({ key, value }) => `${key} → ${value}`)
    expect(missing, 'these address the user but never inflect').toEqual([])
  })

  it('leaves no variant without its neutral base', () => {
    /* i18next falls back to the base key when the user picked "נייטרלי";
       a variant with no base renders the raw key to exactly those users. */
    const orphans = flowCopy()
      .filter(({ name }) => name.endsWith('_male') || name.endsWith('_female'))
      .filter(({ parent, name }) => parent[name.replace(/_(male|female)$/, '')] === undefined)
      .map(({ key }) => key)
    expect(orphans, 'variants with no neutral fallback').toEqual([])
  })

  it('never leaves a male form without its female counterpart', () => {
    const lonely = flowCopy()
      .filter(({ name }) => name.endsWith('_male'))
      .filter(({ parent, name }) => parent[name.replace(/_male$/, '_female')] === undefined)
      .map(({ key }) => key)
    expect(lonely).toEqual([])
  })
})
