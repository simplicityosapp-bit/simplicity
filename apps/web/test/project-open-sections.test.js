/* ════════════════════════════════════════════════════════════════
   WHICH ACCORDION SECTIONS ARE OPEN — remembered for the sitting.
   ════════════════════════════════════════════════════════════════
   Someone who works out of "reminders" had to reopen it on every visit.
   The state is kept in sessionStorage and SHARED across projects: the
   habit belongs to the person, not to one project.

   The trap this pins: a blob stored before a section existed has no key
   for it. Read raw, the new section arrives `undefined` — closed, and
   invisible to every returning user, while a first-time visitor sees it
   open. Merging over the defaults is what keeps those two the same screen.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadOpenSections, saveOpenSections } from '../src/lib/openSections'

const src = readFileSync(new URL('../src/screens/project-detail/index.jsx', import.meta.url), 'utf8')

const KEY = 'mg-open-sec:project-detail'
const DEFAULTS = {
  groups: true, clients: true, meetings: true,
  leads: false, tasks: false, reminders: false, leadPages: false,
}

let store
const useStore = () => {
  store = new Map()
  vi.stubGlobal('window', {
    sessionStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  })
}
beforeEach(useStore)

describe('restoring', () => {
  it('opens at the defaults when nothing is stored', () => {
    expect(loadOpenSections(KEY, DEFAULTS)).toEqual(DEFAULTS)
  })

  it('restores what was stored', () => {
    saveOpenSections(KEY, { ...DEFAULTS, reminders: true, groups: false })
    const out = loadOpenSections(KEY, DEFAULTS)
    expect(out.reminders).toBe(true)
    expect(out.groups).toBe(false)
  })

  /* The one that would have shipped a section nobody could see. */
  it('a section missing from an older blob takes its DEFAULT, not undefined', () => {
    const beforeMeetingsShipped = {
      groups: true, clients: true, leads: false, tasks: false, reminders: false, leadPages: false,
    }
    store.set(KEY, JSON.stringify(beforeMeetingsShipped))
    const out = loadOpenSections(KEY, DEFAULTS)
    expect(out.meetings).toBe(true)
    expect(Object.keys(out).sort()).toEqual(Object.keys(DEFAULTS).sort())
  })

  it('drops keys it no longer knows about', () => {
    store.set(KEY, JSON.stringify({ ...DEFAULTS, retiredSection: true }))
    expect(loadOpenSections(KEY, DEFAULTS)).not.toHaveProperty('retiredSection')
  })

  it('survives junk rather than blanking the screen', () => {
    for (const junk of ['not json', 'null', '"a string"', '42', '[]', '']) {
      store.set(KEY, junk)
      expect(Object.keys(loadOpenSections(KEY, DEFAULTS)).sort()).toEqual(Object.keys(DEFAULTS).sort())
    }
  })

  it('ignores a non-boolean where a boolean belongs', () => {
    store.set(KEY, JSON.stringify({ groups: 'yes', reminders: 1 }))
    const out = loadOpenSections(KEY, DEFAULTS)
    expect(out.groups).toBe(true)
    expect(out.reminders).toBe(false)
  })

  it('never hands back the caller\'s defaults object itself', () => {
    /* Returning DEFAULTS by reference would let a later toggle mutate the
       module-level constant for the rest of the session. */
    const out = loadOpenSections(KEY, DEFAULTS)
    expect(out).not.toBe(DEFAULTS)
    out.groups = false
    expect(DEFAULTS.groups).toBe(true)
  })

  it('survives sessionStorage throwing (private mode, quota)', () => {
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => { throw new Error('denied') },
        setItem: () => { throw new Error('denied') },
      },
    })
    expect(loadOpenSections(KEY, DEFAULTS)).toEqual(DEFAULTS)
    expect(() => saveOpenSections(KEY, DEFAULTS)).not.toThrow()
  })
})

describe('the screen wires it the way the repo requires', () => {
  it('seeds from the loader, not from an inline literal', () => {
    expect(src).toMatch(/useState\(loadOpenSec\)/)
    expect(src).toMatch(/const loadOpenSec = \(\) => loadOpenSections\(OPEN_SEC_KEY, DEFAULT_OPEN_SEC\)/)
  })

  it('writes on the toggle rather than from an effect', () => {
    /* react-hooks/set-state-in-effect forbids the effect form, and a tap is
       the only thing that ever changes this. */
    expect(src).toMatch(/const toggleSec = \(k\) => setOpenSec\(\(s\) => \{[\s\S]{0,200}saveOpenSections\(OPEN_SEC_KEY, next\)/)
    expect(src).not.toMatch(/useEffect\([\s\S]{0,200}OPEN_SEC_KEY/)
  })

  it('shares one key across projects — no project id in it', () => {
    expect(src).toMatch(/const OPEN_SEC_KEY = 'mg-open-sec:project-detail'/)
    expect(src).not.toMatch(/OPEN_SEC_KEY\s*\+|`\$\{OPEN_SEC_KEY\}/)
  })

  it('the stored defaults still name every section the screen renders', () => {
    const rendered = [...new Set([...src.matchAll(/toggleSec\('(\w+)'\)/g)].map((m) => m[1]))]
    expect(rendered.sort()).toEqual(Object.keys(DEFAULTS).sort())
  })
})
