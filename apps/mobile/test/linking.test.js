/* ════════════════════════════════════════════════════════════════
   DEEP LINKS AGREE WITH WEB, AND COVER EVERY SCREEN
   ════════════════════════════════════════════════════════════════
   One address should mean one place in both apps. A path invented here
   would work on the phone and 404 in a browser (or the reverse), and a
   screen added to the navigator without a path would be unreachable from
   any link. Both failures are silent; this makes them red.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { linking } from '../src/navigation/linking'
import { ROUTES } from '../../web/src/lib/routes'

function leaves(screens, out = {}) {
  for (const [name, value] of Object.entries(screens)) {
    if (typeof value === 'string') out[name] = value
    else leaves(value.screens, out)
  }
  return out
}
const paths = leaves(linking.config.screens)
const webPaths = new Set(Object.values(ROUTES).map((p) => p.replace(/:[A-Za-z]+/g, ':param')))

describe('deep links', () => {
  it('uses only paths the web app also serves', () => {
    for (const [name, path] of Object.entries(paths)) {
      const asWeb = `/${path}`.replace(/:[A-Za-z]+/g, ':param')
      expect(webPaths.has(asWeb), `${name} → /${path} is not a web route`).toBe(true)
    }
  })

  it('gives every screen in the navigator a path', () => {
    const src = readFileSync(new URL('../src/navigation/AppNavigator.js', import.meta.url), 'utf8')
    const names = [...src.matchAll(/<(?:Tab|Stack)\.Screen name="([^"]+)"/g)].map((m) => m[1]).filter((n) => n !== 'Main')
    expect(names.length).toBeGreaterThan(10)
    for (const n of names) expect(paths[n], `${n} has no deep link`).toBeDefined()
  })

  it('opens on the app scheme', () => {
    expect(linking.prefixes).toContain('simplicity://')
  })
})
