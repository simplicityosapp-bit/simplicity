/* ════════════════════════════════════════════════════════════════
   מבט על — the words on the screen, and the manual that describes it.
   ════════════════════════════════════════════════════════════════
   Two classes of drift that no type checker sees and no reader of the
   Hebrew build ever notices:

     · The correlation engine returned DISPLAY TEXT, in Hebrew, from
       packages/core — 'חזק' for the strength and 'הכנסות'/'פניות'/'פגישות'
       for the outcome. Both were interpolated straight into the sentence,
       so an English reader got "חזק link · 12 points". They are keys now,
       resolved at render, and these pin that every key the engine can emit
       has a word waiting for it in all four languages.

     · The manual called the screen by a name the app had stopped using —
       "מבט ירח" / "Moon View" against the nav's "מבט על" / "Overview" — in
       both files the manual lives in. A reader searching the guide for the
       screen they were looking at found nothing.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const LANGS = ['he', 'en', 'es', 'fr']
const read = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'))
const moon = (l) => read(`../../../packages/core/src/i18n/locales/${l}/moon.json`)
const help = (l) => read(`../../../packages/core/src/i18n/locales/${l}/help.json`)
const nav = (l) => read(`../../../packages/core/src/i18n/locales/${l}/nav.json`)

/* Mirrors overview.ts — the full set of values each can emit. */
const STRENGTHS = ['strong', 'medium', 'subtle']
const OUTCOMES = ['income', 'leads', 'sessions']
const HEBREW = /[֐-׿]/

describe('the correlation card resolves its own words', () => {
  it.each(LANGS)('%s has a word for every strength the engine emits', (l) => {
    const s = moon(l).corr.strength
    STRENGTHS.forEach((k) => expect(s[k], `${l}: corr.strength.${k}`).toBeTruthy())
  })

  it.each(LANGS)('%s has a word for every count outcome', (l) => {
    /* The outcome reuses the toggle labels above the chart — same words,
       already translated, so the two can never disagree. */
    const p = moon(l).pills
    OUTCOMES.forEach((k) => expect(p[k], `${l}: pills.${k}`).toBeTruthy())
  })

  it.each(['en', 'es', 'fr'])('%s carries no Hebrew at all', (l) => {
    /* The regression this file exists for: Hebrew reaching a non-Hebrew
       reader through a value that looked like data rather than copy. */
    const leaked = []
    const walk = (o, path = '') => Object.entries(o).forEach(([k, v]) => {
      if (typeof v === 'object' && v !== null) walk(v, `${path}${k}.`)
      else if (typeof v === 'string' && HEBREW.test(v)) leaked.push(`${path}${k} = ${v}`)
    })
    walk(moon(l))
    expect(leaked).toEqual([])
  })
})

describe('the manual calls the screen what the app calls it', () => {
  it.each(LANGS)('%s: help title matches the nav label', (l) => {
    expect(help(l).screens.moon.title).toBe(nav(l).items.moon)
  })

  it.each(LANGS)('%s: help title matches the screen title', (l) => {
    expect(help(l).screens.moon.title).toBe(moon(l).title)
  })

  it('the Hebrew fallback copy in helpContent.js agrees with the bundle', () => {
    /* The manual lives in TWO files — the i18n bundle and the raw Hebrew in
       apps/web/src/lib/helpContent.js that it falls back to. Renaming one and
       not the other is the whole failure mode. */
    const raw = readFileSync(fileURLToPath(new URL('../src/lib/helpContent.js', import.meta.url)), 'utf8')
    expect(raw).not.toMatch(/מבט ירח/)
    expect(raw).toContain(help('he').screens.moon.title)
  })
})

describe('the manual documents the sections the screen actually shows', () => {
  /* The rename that prompted this found the manual already adrift on its own:
     fr said "Tendances inter-domaines" where the screen said "inter-modules",
     and en/es called the correlations section "Connections"/"Conexiones"
     against the screen's "Links"/"Vínculos". A reader searching the guide for
     the heading in front of them came up empty. Case-insensitive on purpose —
     the English manual title-cases its headings and that is a house style, not
     a drift. */
  it.each(LANGS)('%s: every section heading has a section in the manual', (l) => {
    const titles = help(l).screens.moon.features.map((f) => f.title.toLowerCase())
    const missing = Object.entries(moon(l).section)
      .filter(([, v]) => !titles.includes(v.toLowerCase()))
      .map(([k, v]) => `${k} (${v})`)
    expect(missing).toEqual([])
  })

  it.each(LANGS)('%s: no section is named after the software\'s internals', (l) => {
    /* "מגמות בין מודולים" — a coach does not have modules. Whatever these are
       called next, they may not be called that. */
    const words = /module|módulo|מודול/i
    Object.values(moon(l).section).forEach((v) => expect(v).not.toMatch(words))
  })
})
