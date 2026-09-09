/* ════════════════════════════════════════════════════════════════
   THE THEME TOGGLE — what a unit test can honestly hold.
   ════════════════════════════════════════════════════════════════
   StyleSheet freezes colours at module load, so changing the palette
   means reloading the JS. That reload used to be DevSettings.reload(),
   which React Native assigns only inside `if (__DEV__)` — no else branch.
   In a release build the module was undefined, the call threw straight
   into a catch, and the switch did nothing: the preference was saved, the
   app stayed light, and the palette changed only if the user killed and
   reopened the app themselves. It shipped that way.

   WHAT IS NOT COVERED HERE, AND WHY. The two reload paths are reached by
   `require()` inside a catch — deliberately lazy, because neither module
   may exist. Those requires run through node's own loader at runtime, so
   vitest's module mocks and its react-native alias both miss them: a
   vi.mock of expo-updates or react-native is silently not applied, and a
   test written over it would assert against the real modules while
   appearing to pass. Rather than reshape working production code to suit
   the runner, the reload itself was verified by reading the sources:
   DevSettings is assigned only under __DEV__ with no else branch, and
   expo-updates' DisabledUpdatesController still implements
   relaunchReactApplicationForModule with a real RecreateReactContext
   procedure — so reloadAsync genuinely reloads even with OTA off. Proving
   it end to end needs a device build, not a unit test.

   What IS pinned below is the part that holds on every platform and would
   have caught the shipped bug's worst consequence: the preference is
   always written, and a theme toggle never throws.
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const setItem = vi.fn(async () => {})

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { setItem: (...a) => setItem(...a), getItem: async () => null },
}))

const { persistThemeAndReload, THEME_KEY, getThemeMode, applyThemeColors, colors } =
  await import('../src/theme/theme')

beforeEach(() => { setItem.mockClear() })

describe('choosing a theme', () => {
  it('always records the choice, so it applies on next launch at worst', async () => {
    await persistThemeAndReload('dark')
    expect(setItem).toHaveBeenCalledWith(THEME_KEY, 'dark')

    await persistThemeAndReload('light')
    expect(setItem).toHaveBeenCalledWith(THEME_KEY, 'light')
  })

  /* The reload is best-effort by design — none of the paths may exist.
     A theme switch must never surface that as an exception. */
  it('never throws, whatever the reload does', async () => {
    await expect(persistThemeAndReload('dark')).resolves.toBeUndefined()
  })

  it('still attempts the reload when storage itself fails', async () => {
    setItem.mockImplementation(async () => { throw new Error('disk full') })
    await expect(persistThemeAndReload('dark')).resolves.toBeUndefined()
  })
})

describe('the palette itself', () => {
  /* applyThemeColors is what boot calls before any StyleSheet runs. It
     mutates the shared object in place — every screen holds a reference
     to it, so replacing it instead of mutating would leave the whole app
     on the old palette with no error anywhere. */
  it('mutates the shared colours object rather than replacing it', () => {
    const same = colors
    applyThemeColors('dark')
    expect(colors).toBe(same)
  })

  it('actually swaps the palette, and reports which one is live', () => {
    applyThemeColors('dark')
    expect(getThemeMode()).toBe('dark')
    const dark = colors.bg

    applyThemeColors('light')
    expect(getThemeMode()).toBe('light')
    expect(colors.bg).not.toBe(dark)
  })

  /* Anything unrecognised is light — a blob from an older build or a
     hand-edited value must not leave the app with an undefined palette. */
  it('falls back to light for anything it does not recognise', () => {
    applyThemeColors('sepia')
    expect(getThemeMode()).toBe('light')
    applyThemeColors(undefined)
    expect(getThemeMode()).toBe('light')
  })
})
