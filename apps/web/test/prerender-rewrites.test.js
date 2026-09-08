/* ════════════════════════════════════════════════════════════════
   PRERENDER-REWRITES SUITE — keeps vercel.json and prerender/routes.js
   describing the same thing.
   ════════════════════════════════════════════════════════════════
   The prerender step writes static HTML for "/" and "/legal". Those files
   are dead weight unless Vercel actually serves them, and the wiring is
   easy to get subtly wrong in ways nothing else notices — a build still
   succeeds, the app still works, and a crawler quietly goes back to
   reading an empty page. The failure modes this suite exists for:

     · a route added to routes.js and never added to vercel.json;
     · the catch-all "/(.*)" drifting above a prerendered route, which
       would swallow it and serve the empty shell;
     · the two ?tab= rules losing their place above the bare "/legal"
       rule, which would serve the privacy policy for ?tab=terms;
     · someone "fixing" the homepage by adding a rewrite for "/". That
       rewrite cannot work — Vercel resolves "/" against the filesystem
       before it consults the rewrite table, which is why the landing page
       is written to index.html and the empty shell moved to app.html.
       This was measured in production: with a "/" rewrite in place, all
       five legal URLs served their prerendered pages and "/" alone kept
       serving the empty shell.

   Vercel matches rewrites in order, first match wins — that ordering is
   part of the contract, so it is what these tests assert.
   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PRERENDER_ROUTES, SPA_SHELL } from '../prerender/routes.js'

const here = dirname(fileURLToPath(import.meta.url))
const vercel = JSON.parse(readFileSync(join(here, '..', 'vercel.json'), 'utf8'))
const rewrites = vercel.rewrites

const rewritten = PRERENDER_ROUTES.filter((r) => r.rewrite !== false)
const viaFilesystem = PRERENDER_ROUTES.filter((r) => r.rewrite === false)
const indexOfDestination = (dest) => rewrites.findIndex((r) => r.destination === dest)
const catchAllIndex = rewrites.findIndex((r) => r.source === '/(.*)')

describe('prerender rewrites', () => {
  it('routes every rewritten page to its file', () => {
    for (const route of rewritten) {
      expect(
        indexOfDestination(`/${route.out}`),
        `${route.location} is prerendered to ${route.out} but nothing in vercel.json points at it`,
      ).toBeGreaterThan(-1)
    }
  })

  it('does not point at a page the prerender step no longer writes', () => {
    const produced = new Set(rewritten.map((r) => `/${r.out}`))
    const stale = rewrites
      .map((r) => r.destination)
      .filter((d) => d.startsWith('/prerender/') && !produced.has(d))
    expect(stale, 'vercel.json rewrites to prerendered files that are never built').toEqual([])
  })

  it('leaves the filesystem-served pages out of the rewrite table', () => {
    /* "/" is served by dist/index.html directly. A rewrite for it would be
       silently dead — Vercel checks the filesystem first. */
    expect(viaFilesystem.map((r) => r.out)).toEqual(['index.html'])
    expect(rewrites.find((r) => r.source === '/')).toBeUndefined()
  })

  it('falls back to the empty shell, not to the prerendered homepage', () => {
    /* index.html is the landing page now. Pointing the catch-all at it
       would flash marketing copy on every deep link into the app. */
    expect(catchAllIndex).toBe(rewrites.length - 1)
    expect(rewrites[catchAllIndex].destination).toBe(`/${SPA_SHELL}`)
    expect(rewrites[catchAllIndex].destination).not.toBe('/index.html')
  })

  it('keeps the api/page rewrites ahead of the catch-all', () => {
    /* /p/:slug and /lead/:slug are server-rendered meta by api/page.js.
       Below the catch-all they would resolve to the empty shell. */
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

  it('builds /p/ and /lead/ pages on the empty shell, not the landing page', () => {
    /* api/page.js fetches the shell and injects the user's SEO into it.
       Once index.html became the prerendered landing page, fetching it there
       served every published page with Simplicity's own marketing copy in
       the body, under the user's title — caught in production, not here,
       which is why this test exists. */
    const src = readFileSync(join(here, '..', 'api', 'page.js'), 'utf8')
    expect(src, 'api/page.js must fetch the empty shell').toContain(`/${SPA_SHELL}`)
    expect(src, 'api/page.js still references index.html, which is now the landing page').not.toContain('/index.html')
  })

  it('serves the /privacy and /terms aliases from the matching document', () => {
    const alias = (source) => rewrites.find((r) => r.source === source)?.destination
    expect(alias('/privacy')).toBe('/prerender/legal-privacy.html')
    expect(alias('/terms')).toBe('/prerender/legal-terms.html')
  })
})
