/* ════════════════════════════════════════════════════════════════
   SWITCHING THE PALETTE — live, without restarting the app.
   ════════════════════════════════════════════════════════════════
   This used to persist the choice and reload, because StyleSheet.create
   copies colour values at module load and a screen built at boot could not
   be told about a new palette. themed() resolves a sheet on ACCESS
   instead, so a switch is now: swap the palette, tell the subscribers, let
   the tree repaint.

   Two things hold that up, and both are here. The palette object must be
   MUTATED rather than replaced — every screen holds that one reference, so
   replacing it would leave the whole app on the old colours with no error
   anywhere. And a themed sheet must hand back the CURRENT mode's values on
   every access, not the ones that were live when it was first read; a
   cache keyed wrongly would look right until someone toggled twice.
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const setItem = vi.fn(async () => {})
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { setItem: (...a) => setItem(...a), getItem: async () => null },
}))

const {
  setThemeMode, applyThemeColors, subscribeTheme, getThemeMode, colors, type, THEME_KEY,
} = await import('../src/theme/theme')
const { themed, themedMap } = await import('../src/theme/themed')

beforeEach(() => {
  setItem.mockClear()
  setItem.mockImplementation(async () => {})
  applyThemeColors('light')
})

describe('the palette object', () => {
  /* Every screen imports this one object. Replacing it instead of
     mutating it would leave the app rendering yesterday's colours, and
     nothing would throw. */
  it('is mutated in place, never replaced', async () => {
    const same = colors
    await setThemeMode('dark')
    expect(colors).toBe(same)
  })

  it('carries the type scale with it', async () => {
    await setThemeMode('dark')
    const darkText = type.body.color
    await setThemeMode('light')
    expect(type.body.color).not.toBe(darkText)
  })
})

describe('setThemeMode', () => {
  it('swaps the palette and reports which one is live', async () => {
    await setThemeMode('dark')
    expect(getThemeMode()).toBe('dark')
    const dark = colors.bg

    await setThemeMode('light')
    expect(getThemeMode()).toBe('light')
    expect(colors.bg).not.toBe(dark)
  })

  it('remembers the choice, so the app opens in it rather than flashing', async () => {
    await setThemeMode('dark')
    expect(setItem).toHaveBeenCalledWith(THEME_KEY, 'dark')
  })

  /* Storage failing is not worth interrupting a theme switch for: the
     palette still changes, it is just forgotten by the next launch. */
  it('still switches when storage fails, and never throws', async () => {
    setItem.mockImplementation(async () => { throw new Error('disk full') })
    await expect(setThemeMode('dark')).resolves.toBeUndefined()
    expect(getThemeMode()).toBe('dark')
  })

  it('falls back to light for anything it does not recognise', async () => {
    await setThemeMode('sepia')
    expect(getThemeMode()).toBe('light')
  })
})

describe('telling the app', () => {
  /* Without this the palette changes and nothing repaints — which is
     exactly the bug the reload used to paper over. */
  it('notifies subscribers with the new mode', async () => {
    const seen = []
    const off = subscribeTheme((m) => seen.push(m))
    await setThemeMode('dark')
    await setThemeMode('light')
    off()
    expect(seen).toEqual(['dark', 'light'])
  })

  it('stops notifying once unsubscribed', async () => {
    const fn = vi.fn()
    subscribeTheme(fn)()
    await setThemeMode('dark')
    expect(fn).not.toHaveBeenCalled()
  })

  /* One listener throwing must not stop the others, or a single bad
     subscriber leaves half the app on the old palette. */
  it('keeps going when a listener throws', async () => {
    const after = vi.fn()
    const offA = subscribeTheme(() => { throw new Error('boom') })
    const offB = subscribeTheme(after)
    await expect(setThemeMode('dark')).resolves.toBeUndefined()
    expect(after).toHaveBeenCalledWith('dark')
    offA(); offB()
  })
})

describe('a themed stylesheet', () => {
  const styles = themed((c, t) => ({
    card: { backgroundColor: c.bg, borderColor: c.border },
    label: { ...t.body },
  }))

  it('resolves against whichever palette is live at the moment it is read', async () => {
    await setThemeMode('light')
    const light = styles.card.backgroundColor

    await setThemeMode('dark')
    expect(styles.card.backgroundColor).not.toBe(light)

    await setThemeMode('light')
    expect(styles.card.backgroundColor).toBe(light)
  })

  /* The type scale carries colours of its own, so a sheet that spreads
     ...t.body has to follow the palette too — otherwise that text stays
     pinned to whatever was live at boot. */
  it('follows the palette through the type scale as well', async () => {
    await setThemeMode('light')
    const light = styles.label.color
    await setThemeMode('dark')
    expect(styles.label.color).not.toBe(light)
  })

  it('is enumerable, so Object.keys and spreading still see it', () => {
    expect(Object.keys(styles).sort()).toEqual(['card', 'label'])
  })
})

/* Stylesheets were only half of it. Screens also keep small colour maps
   beside their sheet — status pills, priority dots, reminder buckets —
   and those were plain objects built once at import, handing out
   boot-time colours forever. The sheet around them repainted on a
   switch and the dot did not. `fill` is the one that actually hides
   things: it inverts between modes, so a light fill left on a dark card
   is a chip you can no longer see. */
describe('a themed colour map', () => {
  const PILL = themedMap((c) => ({
    active: 'rgba(139,168,136,0.14)', // fixed by design, not from the palette
    past: c.fill,
  }))

  it('resolves against whichever palette is live at the moment it is read', async () => {
    await setThemeMode('light')
    const light = PILL.past

    await setThemeMode('dark')
    expect(PILL.past).not.toBe(light)

    /* Toggling BACK has to return the original value. A cache keyed on
       first-read rather than on mode would pass the first switch and
       fail here — which is exactly how this would reach a device. */
    await setThemeMode('light')
    expect(PILL.past).toBe(light)
  })

  it('leaves values that were never palette colours alone', async () => {
    await setThemeMode('dark')
    expect(PILL.active).toBe('rgba(139,168,136,0.14)')
  })

  it('is enumerable, so Object.keys and spreading still see it', () => {
    expect(Object.keys(PILL).sort()).toEqual(['active', 'past'])
  })

  /* Reminder buckets are an ordered list, not a lookup — the screen maps
     over them to build its groups. Proxying an array target keeps
     Array.isArray, .map and spread working, so the call sites did not
     have to change when they became themed. */
  describe('built as an array', () => {
    const BUCKETS = themedMap((c) => ([
      { key: 'overdue', color: c.danger },
      { key: 'later', color: c.textFaint },
    ]))

    it('is still an array', () => {
      expect(Array.isArray(BUCKETS)).toBe(true)
      expect(BUCKETS.length).toBe(2)
      /* A proxy may not report an array's own `length` as configurable
         when its target's is not — get that wrong and this throws a
         TypeError rather than quietly returning the wrong value. */
      expect(Object.keys(BUCKETS)).toEqual(['0', '1'])
    })

    it('maps and spreads like one', () => {
      expect(BUCKETS.map((b) => b.key)).toEqual(['overdue', 'later'])
      expect([...BUCKETS].map((b) => b.key)).toEqual(['overdue', 'later'])
    })

    it('follows the palette through .map', async () => {
      await setThemeMode('light')
      const light = BUCKETS.map((b) => b.color)
      await setThemeMode('dark')
      expect(BUCKETS.map((b) => b.color)).not.toEqual(light)
    })
  })
})
