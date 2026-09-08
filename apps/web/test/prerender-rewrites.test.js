/* ════════════════════════════════════════════════════════════════
   PRERENDER-REWRITES SUITE — keeps vercel.json and prerender/routes.js
   describing the same thing.
   ════════════════════════════════════════════════════════════════
   The prerender step writes static HTML for "/" and "/legal" into
   dist/prerender/. Those files are dead weight unless vercel.json routes
   the public URL to them, and the wiring is easy to get subtly wrong in
   ways nothing else notices — a build still succeeds, the app still
   works, and a crawler quietly goes back to reading an empty page.
   The three failure modes this suite exists for:

     · a route added to routes.js and never added to vercel.json;
     · the catch-all "/(.*) → /index.html" drifting above a prerendered
       route, which would swallow it and serve the empty shell;
     · the two ?tab= rules losing their place above the bare "/legal"
       rule, which would serve the privacy policy for ?tab=terms.

   Vercel matches rewrites in order, first match wins — that ordering is
   the whole contract, so it is what these tests assert.
   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PRERENDER_ROUTES } from '../prerender/routes.js'

const here = dirname(fileURLToPath(import.meta.url))
const vercel = JSON.parse(readFileSync(join(here, '..', 'vercel.json'), 'utf8'))
const rewrites = vercel.rewrites

const indexOfDestination = (dest) => rewrites.findIndex((r) => r.destination === dest)
const catchAllIndex = rewrites.findIndex((r) => r.source === '/(.*)')

describe('prerender rewrites', () => {
  it('routes every prerendered page to its file', () => {
    for (const route of PRERENDER_ROUTES) {
      const dest = `/prerender/${route.out}`
      expect(
        indexOfDestination(dest),
        `${route.location} is prerendered to ${route.out} but nothing in vercel.json points at it`,
      ).toBeGreaterThan(-1)
    }
  })

  it('does not point at a page the prerender step no longer writes', () => {
    const produced = new Set(PRERENDER_ROUTES.map((r) => `/prerender/${r.out}`))
    const stale = rewrites
      .map((r) => r.destination)
      .filter((d) => d.startsWith('/prerender/') && !produced.has(d))
    expect(stale, 'vercel.json rewrites to prerendered files that are never built').toEqual([])
  })

  it('keeps the SPA catch-all last, so it cannot swallow a prerendered route', () => {
    expect(catchAllIndex).toBe(rewrites.length - 1)
    expect(rewrites[catchAllIndex].destination).toBe('/index.html')
  })

  it('keeps the api/page rewrites ahead of the catch-all', () => {
    /* /p/:slug and /lead/:slug are server-rendered meta by api/page.js.
       Below the catch-all they would resolve to the empty index.html. */
    for (const source of ['/p/:slug', '/lead/:slug']) {
      const i = rewrites.findIndex((r) => r.source === source)
      expect(i, `${source} rewrite is missing`).toBeGreaterThan(-1)
      expect(i).toBeLessThan(catchAllIndex)
    }
  })

  it('matches ?tab= before the bare /legal rule', () => {
    const legal = rewrites
      .map((r, i) => ({ ...r, i }))
      .filter((r) => r.source === '/legal')
    const tabbed = legal.filter((r) => r.has?.some((h) => h.type === 'query' && h.key === 'tab'))
    const bare = legal.find((r) => !r.has)

    expect(tabbed.map((r) => r.has[0].value).sort()).toEqual(['dpa', 'terms'])
    expect(bare, 'no fallback rule for /legal without ?tab=').toBeTruthy()
    for (const rule of tabbed) {
      expect(rule.i, `${rule.has[0].value} must be matched before the bare /legal rule`).toBeLessThan(bare.i)
    }
  })

  it('serves the /privacy and /terms aliases from the matching document', () => {
    const alias = (source) => rewrites.find((r) => r.source === source)?.destination
    expect(alias('/privacy')).toBe('/prerender/legal-privacy.html')
    expect(alias('/terms')).toBe('/prerender/legal-terms.html')
  })
})
