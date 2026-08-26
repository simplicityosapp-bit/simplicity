/* ════════════════════════════════════════════════════════════════
   THE SCREEN-COUNT CAPTIONS COUNT PROPERLY.
   ════════════════════════════════════════════════════════════════
   Four mobile screens state how many things they hold. The strings were
   written as a single form with a hardcoded plural noun — "{{count}}
   לקוחות" — so one client read "1 לקוחות". That went unnoticed while the
   figure was a small chip in the header; it is a caption under the title
   now, which is a worse place to be wrong.

   Hebrew has a DUAL, so two of something is its own form. This is the same
   trap projects.json carried until it was fixed earlier.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import i18n, { initI18n, loadLanguage } from '@simplicity/core/i18n'

const LOCALES = ['he', 'en', 'es', 'fr']
const CAPTIONS = [
  ['clients', 'countLabel'],
  ['leads', 'countLabel'],
  ['goals', 'countLabel'],
  ['insights', 'activeCount'],
]

const load = (lang, ns) => JSON.parse(readFileSync(
  new URL(`../../../packages/core/src/i18n/locales/${lang}/${ns}.json`, import.meta.url), 'utf8',
))

describe('the caption strings carry plural forms', () => {
  it('no locale still holds a single flat form', () => {
    for (const lang of LOCALES) {
      for (const [ns, key] of CAPTIONS) {
        const j = load(lang, ns)
        expect(j[key], `${lang}/${ns}.${key} is still one flat string`).toBeUndefined()
        expect(j[`${key}_one`], `${lang}/${ns}.${key}_one`).toBeTruthy()
        expect(j[`${key}_other`], `${lang}/${ns}.${key}_other`).toBeTruthy()
      }
    }
  })

  it('Hebrew declares its dual', () => {
    for (const [ns, key] of CAPTIONS) {
      expect(load('he', ns)[`${key}_two`], `he/${ns}.${key}_two`).toBeTruthy()
    }
  })
})

describe('they resolve through i18next', () => {
  beforeAll(async () => {
    await initI18n({ lng: 'he' })
    await Promise.all(['en', 'es', 'fr'].map(loadLanguage))
  })

  it('every count resolves to real text', () => {
    for (const lang of LOCALES) {
      for (const [ns, key] of CAPTIONS) {
        const t = i18n.getFixedT(lang, ns)
        for (const count of [0, 1, 2, 5, 42]) {
          const out = t(key, { count })
          expect(out, `${lang}/${ns}.${key} @${count}`).not.toBe(key)
          expect(out, `${lang}/${ns}.${key} @${count} is empty`).toBeTruthy()
        }
      }
    }
  })

  /* The bug itself: the singular must not be the plural with the number
     swapped in. "1 client" is perfectly good English — what was wrong was
     "1 לקוחות", i.e. the SAME wording as the plural. Comparing the two
     renderings catches that in any language without forbidding a digit. */
  it('the singular is not just the plural with a 1 in it', () => {
    for (const lang of LOCALES) {
      for (const [ns, key] of CAPTIONS) {
        const t = i18n.getFixedT(lang, ns)
        const one = t(key, { count: 1 })
        const manyAsOne = t(key, { count: 5 }).replace(/\b5\b/, '1')
        expect(one, `${lang}/${ns}.${key}: singular "${one}" is the plural wording`)
          .not.toBe(manyAsOne)
      }
    }
  })

  it('Hebrew uses a distinct form for two', () => {
    for (const [ns, key] of CAPTIONS) {
      const t = i18n.getFixedT('he', ns)
      expect(t(key, { count: 2 }), `he/${ns}.${key} @2`).not.toBe(t(key, { count: 1 }))
    }
  })

  it('the insights caption names what is active', () => {
    /* It read "3 פעילות" — active WHAT? The caption stands alone now. */
    const he = i18n.getFixedT('he', 'insights')('activeCount', { count: 3 })
    expect(he).toContain('שאלות')
    const en = i18n.getFixedT('en', 'insights')('activeCount', { count: 3 })
    expect(en.toLowerCase()).toContain('question')
  })
})

describe('the four screens render the caption', () => {
  const screen = (n) => readFileSync(
    new URL(`../../mobile/src/screens/${n}.js`, import.meta.url), 'utf8',
  )

  it.each([
    ['ClientsScreen', 'clients:countLabel'],
    ['LeadsScreen', 'leads:countLabel'],
    ['GoalsScreen', 'goals:countLabel'],
  ])('%s states its count below the header', (name, key) => {
    const src = screen(name)
    expect(src).toMatch(/<ScreenCount>/)
    expect(src).toContain(key)
    /* And it is no longer riding in the HEADER, which the rule reserves for
       the screen name and its icon. Scoped to the ScreenHead element — a bare
       /^\s*meta=/ also catches LeadsScreen's unrelated `meta={m.key}` on a
       StatusGroup, which is none of this rule's business. */
    const head = src.slice(src.indexOf('<ScreenHead'))
    const headEl = head.slice(0, head.indexOf('/>') + 2)
    expect(headEl, `${name}: ScreenHead element not found`).toContain('<ScreenHead')
    expect(headEl).not.toMatch(/\bmeta=/)
    expect(headEl).not.toMatch(/\btagline=/)
  })

  it('InsightsScreen states its count below the header', () => {
    const src = screen('InsightsScreen')
    expect(src).toMatch(/<ScreenCount>/)
    expect(src).toMatch(/activeQuestionCount/)
    expect(src).toMatch(/const activeQuestionCount = questions\.filter\(\(q\) => q\.active\)\.length/)
  })

  it('the shared component exists rather than four copies', () => {
    const comp = readFileSync(
      new URL('../../mobile/src/components/ScreenCount.js', import.meta.url), 'utf8',
    )
    expect(comp).toMatch(/export default function ScreenCount/)
    /* Renders nothing rather than an empty line when there is no count. */
    expect(comp).toMatch(/return null/)
  })
})
