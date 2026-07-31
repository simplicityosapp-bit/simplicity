/* ════════════════════════════════════════════════════════════════
   A FROZEN SCREEN MUST BE ABLE TO THAW.
   ════════════════════════════════════════════════════════════════
   `body.modal-open .screen { overflow: hidden }` is the only rule in the app
   that can stop a screen scrolling. It used to be driven by a running tally,
   which has to stay balanced forever: drift up by one and the user is left with
   a screen frozen at the top, nothing visibly broken, and nothing to press.

   The lock is derived from a set of tokens now, and reconcileModalLock runs on
   every route change as the way back. These assert both halves — the normal
   stacking behaviour, and that a leak cannot survive a navigation.

   The suite runs in node with no DOM and no jsdom dependency, so the three
   calls the module actually makes are stubbed: body.classList, and a
   querySelector that answers whether a modal is really on screen. Everything
   under test is the module's own logic.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'

const classes = new Set()
let sheetOnScreen = false

globalThis.document = {
  body: {
    classList: {
      toggle: (name, force) => (force ? classes.add(name) : classes.delete(name)),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
  },
  querySelector: (sel) => (sel === '.m-sheet.open' && sheetOnScreen ? {} : null),
}

const { acquireModalLock, reconcileModalLock } = await import('../src/lib/modalLock')

const locked = () => classes.has('modal-open')

beforeEach(() => {
  classes.clear()
  sheetOnScreen = false
  reconcileModalLock()   // drop anything a previous test left holding
})

afterAll(() => { delete globalThis.document })

describe('the scroll lock while modals open and close', () => {
  it('locks on the first modal and lifts on the last', () => {
    const release = acquireModalLock()
    expect(locked()).toBe(true)
    release()
    expect(locked()).toBe(false)
  })

  it('stays locked while a second modal is stacked over the first', () => {
    const releaseA = acquireModalLock()
    const releaseB = acquireModalLock()
    releaseA()
    expect(locked(), 'the modal still on screen needs the lock').toBe(true)
    releaseB()
    expect(locked()).toBe(false)
  })

  it('survives a release called twice — one modal cannot unlock another', () => {
    const releaseA = acquireModalLock()
    const releaseB = acquireModalLock()
    releaseA()
    releaseA()
    expect(locked(), 'B is still open; A releasing twice must not lift it').toBe(true)
    releaseB()
    expect(locked()).toBe(false)
  })
})

describe('reconcileModalLock — the way back', () => {
  it('lifts a lock that nobody released, once no modal is on screen', () => {
    acquireModalLock()          // the leak: its release is never called
    expect(locked()).toBe(true)
    reconcileModalLock()
    expect(locked(), 'a route change must free a stuck screen').toBe(false)
  })

  it('leaves a genuinely open modal alone', () => {
    sheetOnScreen = true
    acquireModalLock()
    reconcileModalLock()
    expect(locked(), 'a modal is really open — the background stays frozen').toBe(true)
  })

  it('releases the leaked token too, so the next modal still balances', () => {
    acquireModalLock()
    reconcileModalLock()
    const release = acquireModalLock()
    expect(locked()).toBe(true)
    release()
    expect(locked(), 'the stale token must not keep the lock alive').toBe(false)
  })

  it('is safe to call when nothing was ever locked', () => {
    expect(() => reconcileModalLock()).not.toThrow()
    expect(locked()).toBe(false)
  })
})
