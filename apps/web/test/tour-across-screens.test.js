/* ════════════════════════════════════════════════════════════════
   A TOUR BELONGS TO THE SCREEN THAT IS ACTUALLY THERE.
   ════════════════════════════════════════════════════════════════
   ScreenTour resets itself when the screen changes, and it always has. The
   trouble is what "the screen" meant: `screenKeyFromPath` maps a route to a
   KEY, and several routes share one. /projects and /projects/:id are both
   'projects'; /clients and /clients/:id are both 'clients'. So walking into a
   project was not a screen change, the reset never ran, and the LIST's tour
   carried onto the detail screen — a bubble describing a summary card that is
   not there, over a spotlight frozen on the rectangle its target used to
   occupy. Verified live before the fix: on /projects/:id the bubble read
   "סיכום הפרויקטים 1/3" while .p-hero and .p-list were both absent.

   The second half is overlays. Tapping a client card mid-walk opens their
   file, and the tour bubble — which paints above everything — landed in the
   middle of the thing the user had just asked to see.

   Both are pinned here as source properties: this app has no DOM test runner,
   and the behaviour was confirmed in the browser.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { screenKeyFromPath } from '../src/lib/nav'

const src = readFileSync(new URL('../src/components/ScreenTour.jsx', import.meta.url), 'utf8')

describe('the routes that share a screen key', () => {
  it('are why a key alone cannot decide when to reset', () => {
    /* If these ever stop sharing a key the fix below is harmless, but the
       reason for it would be gone — so the reason is stated as a test. */
    expect(screenKeyFromPath('/projects')).toBe(screenKeyFromPath('/projects/abc'))
    expect(screenKeyFromPath('/clients')).toBe(screenKeyFromPath('/clients/abc'))
  })
})

describe('the tour resets on the route, not just the key', () => {
  it('reads the path', () => {
    expect(src).toMatch(/import \{ useLocation \} from 'react-router-dom'/)
    expect(src).toMatch(/const \{ pathname \} = useLocation\(\)/)
  })

  it('re-runs the start effect when it changes', () => {
    expect(src).toMatch(/\}, \[screenKey, pathname\]\)/)
  })

  it('still clears everything on the way in', () => {
    /* A stale rect is what painted the spotlight over the wrong screen. */
    expect(src).toMatch(/setActive\(false\); setIntro\(false\); setIdx\(0\); setRect\(null\); setSteps\(\[\]\)/)
  })
})

describe('an overlay owns the screen while it is open', () => {
  it('names the three that can take it', () => {
    /* A modal sheet, the client file, the menu. */
    for (const sel of ['.m-sheet.open', '.cd-panel.open', '.drawer-panel.open']) {
      expect(src, sel).toContain(sel)
    }
  })

  it('does not start a tour underneath one', () => {
    /* Waiting, not giving up: the try counter keeps running, so a drawer left
       open simply lets the poll expire rather than retiring the screen. */
    expect(src).toMatch(/if \(overlayOpen\(\)\) return\s*\n\s*const present = pending\.filter/)
  })

  it('stops a running tour when one opens', () => {
    expect(src).toMatch(/new MutationObserver\(check\)/)
    expect(src).toMatch(/attributeFilter: \['class'\]/)
  })

  it('stops it WITHOUT retiring the screen', () => {
    /* markSeen is what Escape does — the user saying they are done. An
       overlay is an interruption, so the steps not yet acknowledged stay
       owed and the walk resumes on the next visit. */
    const effect = src.match(/if \(!active\) return[\s\S]*?\}, \[active, restoreScroll\]\)/)?.[0] || ''
    expect(effect, 'the overlay effect').toBeTruthy()
    expect(effect).toMatch(/setActive\(false\)/)
    expect(effect).not.toMatch(/markSeen/)
  })
})
