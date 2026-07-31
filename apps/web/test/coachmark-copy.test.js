/* ════════════════════════════════════════════════════════════════
   EVERY COACHMARK HAS SOMETHING TO SAY.
   ════════════════════════════════════════════════════════════════
   coachmarkText() returns empty strings for an id it does not know, and
   <Coachmark> renders `{virgin && text && …}` — so an unregistered id produces
   a button that glows invitingly and then says nothing at all. Nothing throws,
   nothing looks broken, and the guidance is simply absent.

   That is exactly what happened to the booking-pages screen: it wrapped its
   "new page" button in a Coachmark whose id was never added to COACHMARK_IDS,
   so the one piece of guidance on the screen had been silent since the day it
   was written. These tests make the two lists prove each other.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const LANGS = ['he', 'en', 'es', 'fr']

const guidance = (lang) =>
  JSON.parse(readFileSync(`src/i18n/locales/${lang}/guidance.json`, 'utf8')).coachmark

/* The registry lives in a module that imports i18n and the locale JSONs, which
   would drag half the app into a plain-node test. The list is a flat literal —
   read it out of the source instead. */
const registryIds = () => {
  const src = readFileSync('src/lib/coachmarks.js', 'utf8')
  const m = src.match(/const COACHMARK_IDS = \[([^\]]+)\]/)
  if (!m) throw new Error('COACHMARK_IDS not found — did the registry move?')
  return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
}

describe('coachmark ids and their copy', () => {
  it('registers at least the ids we know about', () => {
    expect(registryIds().length).toBeGreaterThan(5)
  })

  it('gives every registered id a bubble in every language', () => {
    const missing = []
    for (const lang of LANGS) {
      const copy = guidance(lang)
      for (const id of registryIds()) {
        if (!String(copy[id]?.bubble ?? '').trim()) missing.push(`${lang}:${id}`)
      }
    }
    expect(missing, 'a registered coachmark with no bubble glows and says nothing').toEqual([])
  })

  it('gives every registered id a detail in every language', () => {
    const missing = []
    for (const lang of LANGS) {
      const copy = guidance(lang)
      for (const id of registryIds()) {
        if (!String(copy[id]?.detail ?? '').trim()) missing.push(`${lang}:${id}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('registers every id that has copy — copy with no id never reaches a screen', () => {
    const registered = new Set(registryIds())
    const orphans = Object.keys(guidance('he')).filter((id) => !registered.has(id))
    expect(orphans, 'guidance written for an id the registry rejects is dead text').toEqual([])
  })

  it('keeps the booking page in the set — the one that was silent', () => {
    expect(registryIds()).toContain('add-booking-page')
    expect(guidance('he')['add-booking-page'].bubble).toBeTruthy()
  })

  it('keeps he gendered variants wherever the neutral base has them', () => {
    /* he addresses the user directly, so a bubble that exists must carry both
       forms or neither — a half-gendered entry reads as a bug to the reader. */
    const he = guidance('he')
    const half = Object.entries(he).filter(([, v]) =>
      Boolean(v.bubble_male) !== Boolean(v.bubble_female))
    expect(half.map(([k]) => k)).toEqual([])
  })
})
