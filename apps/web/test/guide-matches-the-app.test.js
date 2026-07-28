/* ════════════════════════════════════════════════════════════════
   THE GUIDE HAS TO DESCRIBE THE APP THAT EXISTS.
   ════════════════════════════════════════════════════════════════
   The settings rework renamed sections, moved two of them to other
   screens, retired option labels and added a search field — and the
   guide, which names all of those in prose, kept describing the screen
   as it had been. It claimed "nine areas" over a screen with four,
   sent readers to sections that were now link rows, and offered
   "frosted / flat / outlined" for a control with two options.

   Nothing failed. Prose has no compiler, and the only way to notice was
   to read 1,500 lines of Hebrew against the code. These are the checks
   that would have caught it, expressed as properties rather than as a
   list of forbidden phrases — a blacklist only knows about the rot
   someone already found.

   The properties:
     1. the two copies of the Hebrew guide stay identical
     2. every part of the settings tree is named in the settings entry
     3. the home entry's card list names the real cards
     4. every "Settings → X" path names a real part of the tree
     5. every screen the app can route to is documented, or exempt

   All four languages, because a guide that rots in French only is the
   same bug wearing a different accent.
   ════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { SETTINGS_TREE } from '@simplicity/core'
import { WIDGET_REGISTRY } from '../src/lib/preferences'
import { screenKeyFromPath, NO_HELP_SCREENS } from '../src/lib/nav'
import { ROUTES } from '../src/lib/routes'

const LOCALES = ['he', 'en', 'es', 'fr']
const load = (lang, ns) => JSON.parse(
  readFileSync(new URL(`../../../packages/core/src/i18n/locales/${lang}/${ns}.json`, import.meta.url), 'utf8'),
)

/* Hebrew has no case; the other three do, and a guide is prose — it will
   say "meeting types and prices" mid-sentence where the section title is
   capitalised. Case is not the thing being checked here. */
const fold = (s) => String(s || '').toLowerCase()

describe('the guide and the app agree', () => {
  it('keeps its two Hebrew copies identical', () => {
    /* lib/helpContent.js is the source of truth and he/help.json the copy
       i18n serves. Editing one and not the other is how the fallback ends
       up contradicting what users read — and the fallback is what shows if
       the locale chunk ever fails to load. */
    const js = readFileSync(new URL('../src/lib/helpContent.js', import.meta.url), 'utf8')
    const head = 'export const HELP_SCREENS = '
    const start = js.indexOf(head) + head.length
    let depth = 0, end = -1
    for (let i = start; i < js.length; i++) {
      if (js[i] === '{') depth++
      else if (js[i] === '}') { depth--; if (depth === 0) { end = i + 1; break } }
    }
    expect(end, 'could not find the HELP_SCREENS literal').toBeGreaterThan(start)
    const fromJs = JSON.parse(js.slice(start, end))
    const fromLocale = load('he', 'help').screens
    for (const key of Object.keys(fromJs)) {
      expect(fromLocale[key], `he/help.json has no "${key}"`).toBeTruthy()
      expect(fromLocale[key], `"${key}" differs between helpContent.js and he/help.json`).toEqual(fromJs[key])
    }
  })

  LOCALES.forEach((lang) => {
    it(`names every part of the settings tree in the settings entry — ${lang}`, () => {
      const s = load(lang, 'settings')
      const guide = fold(JSON.stringify(load(lang, 'help').screens.settings))
      SETTINGS_TREE.forEach((group) => {
        expect(guide, `group "${group.key}" is undocumented`).toContain(fold(s.groups[group.key].title))
        /* A one-section group IS that section — the screen opens straight
           into it, and the guide names the group. Naming both would read as
           two things. */
        if (group.items.length > 1) {
          group.items.forEach((key) => {
            expect(guide, `section "${key}" is undocumented`).toContain(fold(s.sections[key].title))
          })
        }
        ;(group.links || []).forEach((key) => {
          /* Subscription is behind a flag and not drawn, so the guide is
             right not to describe a row nobody can see. */
          if (key === 'subscription') return
          expect(guide, `link "${key}" is undocumented`).toContain(fold(s.links[key].title))
        })
      })
    })

    it(`lists the real home cards, by their real names — ${lang}`, () => {
      /* Checked against the FIRST feature, which is the enumeration. A
         looser "somewhere in the entry" check passed while the list called
         the overview card "Vue d'ensemble" and the app called it "Aperçu". */
      const names = load(lang, 'settings').widgets.names
      const list = fold(load(lang, 'help').screens.home.features[0].body)
      WIDGET_REGISTRY.forEach(({ id }) => {
        expect(names[id], `no name for widget "${id}"`).toBeTruthy()
        expect(list, `the card list omits "${id}" (${names[id]})`).toContain(fold(names[id]))
      })
    })

    it(`points every "Settings → …" path at something real — ${lang}`, () => {
      /* Only the first segment: deeper ones name controls ("→ Export data"),
         which this has no way to enumerate. The first segment is what broke
         — paths survived into the guide naming sections that had become
         link rows or been renamed. */
      const s = load(lang, 'settings')
      const valid = new Set()
      SETTINGS_TREE.forEach((g) => {
        valid.add(fold(s.groups[g.key].title))
        g.items.forEach((k) => valid.add(fold(s.sections[k].title)))
        ;(g.links || []).forEach((k) => valid.add(fold(s.links[k].title)))
      })
      /* Checked by "does the text after the arrow START WITH a real title",
         not by capturing up to some punctuation: a section title can contain
         a comma ("Currency, date and time") and the prose continues straight
         out of the title ("Daily questions and choose…"), so any attempt to
         find the segment's end guesses wrong in both directions. */
      const blob = JSON.stringify(load(lang, 'help'))
      const marker = `${s.header.title} → `
      const unresolved = []
      for (let i = blob.indexOf(marker); i >= 0; i = blob.indexOf(marker, i + 1)) {
        const after = blob.slice(i + marker.length)
        if (![...valid].some((title) => fold(after).startsWith(title))) {
          unresolved.push(after.slice(0, 40).split('\\')[0])
        }
      }
      expect(unresolved, `these lead nowhere: ${[...new Set(unresolved)].join(' · ')}`).toEqual([])
    })
  })

  it('documents every screen the app can route to', () => {
    /* An undocumented screen is not a blank sheet: HelpFab falls back to the
       HOME guide, so the ? button confidently explains the wrong screen.
       That is what /help did until it was added to NO_HELP_SCREENS. */
    const screens = new Set(Object.values(ROUTES).map((p) => screenKeyFromPath(p)))
    const documented = new Set(Object.keys(load('he', 'help').screens))
    const gaps = [...screens].filter((k) => !documented.has(k) && !NO_HELP_SCREENS.has(k))
    expect(gaps, `no guide entry and no exemption: ${gaps.join(', ')}`).toEqual([])
  })

  it('exempts only screens that exist', () => {
    /* A stale exemption silences a ? button nobody meant to silence. */
    const screens = new Set(Object.values(ROUTES).map((p) => screenKeyFromPath(p)))
    const stale = [...NO_HELP_SCREENS].filter((k) => !screens.has(k))
    expect(stale, `exempted but unroutable: ${stale.join(', ')}`).toEqual([])
  })
})
