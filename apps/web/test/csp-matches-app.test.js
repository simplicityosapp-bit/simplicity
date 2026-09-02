/* ════════════════════════════════════════════════════════════════
   CSP SUITE — keeps the Content-Security-Policy in vercel.json honest
   about the app it is supposed to protect.

   Why this exists: the policy pins the inline bootstrap script by SHA-256
   hash. Editing that script changes its hash, and nothing anywhere noticed —
   the hash in vercel.json went stale in June 2026 when the bootstrap gained
   card-style and text-strength handling, and stayed stale. While the header
   is Report-Only that is invisible; the moment it is enforced, the theme,
   text size, background and card style a user chose stop being applied on
   every page load.

   A stale hash is not a policy anyone can eyeball, so it gets a test.
   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, '..', p), 'utf8')

/* The build copies index.html's inline scripts through byte-for-byte, so the
   source file is a faithful stand-in and this needs no build step. */
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g
const sha256 = (body) => `sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`

function cspDirectives() {
  const json = JSON.parse(read('vercel.json'))
  const header = (json.headers ?? [])
    .flatMap((rule) => rule.headers ?? [])
    .find((h) => /^content-security-policy(-report-only)?$/i.test(h.key))
  expect(header, 'vercel.json declares a Content-Security-Policy header').toBeTruthy()

  const directives = {}
  for (const part of header.value.split(';').map((s) => s.trim()).filter(Boolean)) {
    const [name, ...values] = part.split(/\s+/)
    directives[name] = values
  }
  return directives
}

describe('Content-Security-Policy matches the app it protects', () => {
  it('allows every inline script index.html actually ships', () => {
    const bodies = [...read('index.html').matchAll(INLINE_SCRIPT)].map((m) => m[1])
    expect(bodies.length, 'index.html has inline scripts to account for').toBeGreaterThan(0)

    const allowed = new Set(
      (cspDirectives()['script-src'] ?? []).map((v) => v.replace(/^'|'$/g, '')),
    )
    for (const body of bodies) {
      const hash = sha256(body)
      expect(
        allowed.has(hash),
        `an inline script in index.html is not allowed by script-src.\n` +
        `Add '${hash}' to the CSP in vercel.json (it starts: ${body.trim().slice(0, 50).replace(/\s+/g, ' ')}…)`,
      ).toBe(true)
    }
  })

  it('has no leftover script hashes for scripts that no longer exist', () => {
    const shipped = new Set([...read('index.html').matchAll(INLINE_SCRIPT)].map((m) => sha256(m[1])))
    const pinned = (cspDirectives()['script-src'] ?? [])
      .map((v) => v.replace(/^'|'$/g, ''))
      .filter((v) => v.startsWith('sha256-'))
    for (const hash in Object.fromEntries(pinned.map((h) => [h, true]))) {
      expect(shipped.has(hash), `script-src pins ${hash}, which no inline script produces any more`).toBe(true)
    }
  })

  it('frames only the hosts the site renderer can emit', () => {
    /* SiteRenderer builds iframes for video embeds and for a Google Maps
       address block. The maps host was missing, so an enforced policy would
       have blanked the map on every published page carrying an address. */
    const frameSrc = cspDirectives()['frame-src'] ?? []
    for (const host of ['https://www.youtube.com', 'https://player.vimeo.com', 'https://www.google.com']) {
      expect(frameSrc, `frame-src covers ${host}`).toContain(host)
    }
  })

  it('sends violations somewhere — the whole point of Report-Only', () => {
    /* Report-Only without a destination is decoration: the browser blocks
       nothing AND tells nobody. That is how a stale hash and a missing frame
       host survived for months. */
    const d = cspDirectives()
    const endpoint = '/api/csp-report'
    expect(d['report-uri'], 'legacy reporting (Firefox, Safari)').toEqual([endpoint])
    expect(d['report-to'], 'Reporting API group (Chrome)').toEqual(['csp'])

    const json = JSON.parse(read('vercel.json'))
    const reporting = (json.headers ?? [])
      .flatMap((rule) => rule.headers ?? [])
      .find((h) => h.key === 'Reporting-Endpoints')
    expect(reporting, 'Reporting-Endpoints header exists').toBeTruthy()
    // The group named in report-to must be the one the header defines, or
    // Chrome silently drops every report.
    expect(reporting.value).toContain(`csp="${endpoint}"`)
  })

  it('keeps the directives that make the policy worth having', () => {
    const d = cspDirectives()
    expect(d['object-src']).toEqual(["'none'"])
    expect(d['frame-ancestors']).toEqual(["'none'"])
    expect(d['base-uri']).toEqual(["'self'"])
    expect(d['default-src']).toEqual(["'self'"])
    // 'unsafe-eval' would let any injected string become code, which is most
    // of what the rest of this policy exists to prevent.
    expect((d['script-src'] ?? []).join(' ')).not.toContain('unsafe-eval')
    expect((d['script-src'] ?? []).join(' ')).not.toContain('unsafe-inline')
  })
})
