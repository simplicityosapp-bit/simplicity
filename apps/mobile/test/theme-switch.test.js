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
const { themed } = await import('../src/theme/themed')

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
