/* Boot-time language and layout direction.
   ────────────────────────────────────────────────────────────────
   Both decisions are made once, at module load, before anything renders,
   and both were wrong in a way nothing could see:

     · the language came from the DEVICE locale while the user's own
       choice sat unread in storage, so `applySavedLanguage` flipped the
       strings a moment later underneath a layout direction that had
       already been decided — and, once the app began relaunching to
       apply direction, a device and a preference that disagreed would
       have relaunched on every single cold start.

     · the direction decision produced a signal nobody acted on. RN
       writes forceRTL for the NEXT process, so the first run after an
       install rendered Hebrew with an LTR engine.

   The web guard is the one worth being blunt about: forceRTL is a
   documented no-op on react-native-web, so "do we still need the other
   direction" is permanently yes there, and acting on it reloads the page
   forever. That is a broken preview, not a broken phone, which is
   precisely the kind of thing nobody notices until it wastes an
   afternoon. */

import { describe, it, expect } from 'vitest'
import { pickLanguage, rtlRelaunchNeeded, shouldRelaunchForRtl } from '../src/lib/bootPrefs'

const SUPPORTED = ['he', 'en', 'es', 'fr']

describe('pickLanguage', () => {
  it('prefers the saved choice over the device locale', () => {
    expect(pickLanguage('he', 'en', SUPPORTED)).toBe('he')
    expect(pickLanguage('fr', 'he', SUPPORTED)).toBe('fr')
  })

  it('falls back to the device when nothing was saved', () => {
    expect(pickLanguage(null, 'en', SUPPORTED)).toBe('en')
    expect(pickLanguage(undefined, 'he', SUPPORTED)).toBe('he')
  })

  it('ignores a saved language this build does not ship', () => {
    // A stale key from an older build, or a hand-edited value.
    expect(pickLanguage('de', 'en', SUPPORTED)).toBe('en')
    expect(pickLanguage('', 'he', SUPPORTED)).toBe('he')
  })
})

describe('rtlRelaunchNeeded', () => {
  it('is true when the engine direction disagrees with the language', () => {
    // First launch after install on a Hebrew device: engine still LTR.
    expect(rtlRelaunchNeeded({ platform: 'android', isRTL: false, wantRtl: true })).toBe(true)
    // Leaving Hebrew: engine still RTL.
    expect(rtlRelaunchNeeded({ platform: 'ios', isRTL: true, wantRtl: false })).toBe(true)
  })

  it('is false once they agree', () => {
    expect(rtlRelaunchNeeded({ platform: 'android', isRTL: true, wantRtl: true })).toBe(false)
    expect(rtlRelaunchNeeded({ platform: 'ios', isRTL: false, wantRtl: false })).toBe(false)
  })

  it('is never true on web, however far apart they are', () => {
    expect(rtlRelaunchNeeded({ platform: 'web', isRTL: false, wantRtl: true })).toBe(false)
    expect(rtlRelaunchNeeded({ platform: 'web', isRTL: true, wantRtl: false })).toBe(false)
  })
})

describe('shouldRelaunchForRtl', () => {
  it('spends the one attempt when this direction has not been tried', () => {
    expect(shouldRelaunchForRtl(null, 'rtl')).toBe(true)
    expect(shouldRelaunchForRtl('ltr', 'rtl')).toBe(true)
  })

  it('refuses a second attempt at the same direction', () => {
    // forceRTL did not take. One more launch is a cost; every launch is a bug.
    expect(shouldRelaunchForRtl('rtl', 'rtl')).toBe(false)
  })

  it('re-arms when the wanted direction changes', () => {
    expect(shouldRelaunchForRtl('rtl', 'ltr')).toBe(true)
  })
})
