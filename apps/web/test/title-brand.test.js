/* ════════════════════════════════════════════════════════════════
   TITLE-BRAND SUITE — the tab title is Latin, the social card is Hebrew.
   ════════════════════════════════════════════════════════════════
   Google's OAuth consent screen shows the App name in Latin ("Simplicity").
   A reviewer who opens the homepage or the privacy policy has to see that
   same word first, so every <title> the site serves leads with it.

   Nothing else moves. og:title, twitter:title, og:site_name and the
   schema.org name stay Hebrew — they are what a person sees when a link is
   shared into WhatsApp, and that audience is not the reviewer. The two used
   to be set from one string in prerender/build.js, which is exactly the
   coupling this suite exists to prevent from coming back.
   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PRERENDER_ROUTES } from '../prerender/routes.js'

const here = dirname(fileURLToPath(import.meta.url))
const indexHtml = readFileSync(join(here, '..', 'index.html'), 'utf8')

const BRAND_LATIN = 'Simplicity'
const BRAND_HEBREW = 'סימפליסיטי'

const titleOf = (html) => (html.match(/<title>([^<]*)<\/title>/) || [])[1]
const metaOf = (html, attr, key) => {
  const re = new RegExp(`<meta[^>]*\\s${attr}="${key}"[^>]*\\scontent="([^"]*)"`)
  return (html.match(re) || [])[1]
}

describe('title brand', () => {
  it('leads the shell title with the Latin brand', () => {
    expect(titleOf(indexHtml)).toMatch(new RegExp(`^${BRAND_LATIN}\\b`))
  })

  it('leads every prerendered page title with the Latin brand', () => {
    const titled = PRERENDER_ROUTES.filter((r) => r.title)
    expect(titled.length, 'no prerendered route sets a title').toBeGreaterThan(0)
    for (const route of titled) {
      expect(route.title, `${route.location} must open with "${BRAND_LATIN}"`).toMatch(
        new RegExp(`^${BRAND_LATIN}\\b`),
      )
    }
  })

  it('leaves the shell social tags in Hebrew', () => {
    for (const [attr, key] of [
      ['property', 'og:title'],
      ['property', 'og:site_name'],
      ['name', 'twitter:title'],
    ]) {
      expect(metaOf(indexHtml, attr, key), `${key} should still carry the Hebrew brand`).toContain(BRAND_HEBREW)
    }
  })

  it('leaves the structured-data name in Hebrew', () => {
    expect(indexHtml).toContain(`"name": "${BRAND_HEBREW}"`)
    expect(indexHtml).toContain(`"alternateName": "${BRAND_LATIN}"`)
  })

  it('keeps each prerendered page a Hebrew card when shared', () => {
    /* A route that overrides the <title> must say what the social card gets,
       or it would inherit the shell's homepage card on a privacy policy. */
    for (const route of PRERENDER_ROUTES.filter((r) => r.title)) {
      expect(route.socialTitle, `${route.location} sets a title but no socialTitle`).toBeTruthy()
      expect(route.socialTitle, `${route.location} social card should stay Hebrew`).toContain(BRAND_HEBREW)
      expect(route.socialTitle).not.toBe(route.title)
    }
  })
})
