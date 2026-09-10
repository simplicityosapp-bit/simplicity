/* The two preferences that have to be known BEFORE the app graph evaluates.
   ────────────────────────────────────────────────────────────────
   Both are read in index.js, from AsyncStorage, before `require('./App')` —
   see the long note there for why that read cannot sit anywhere later.

   The palette was the first one: RN freezes StyleSheet colours at module
   load, so a dark-mode user opened to a flash of light. The language is the
   second, and it has a harder version of the same problem. `setupI18n` runs
   at App module load and picks a language, and layout DIRECTION follows the
   language — but `I18nManager.forceRTL` only takes effect on the NEXT
   process, so whatever direction that first decision implies is the one the
   user gets for the whole session. Deciding it from the device locale while
   the user has chosen something else means deciding it wrong, then having
   `applySavedLanguage` flip the strings underneath a layout that cannot
   follow. It also meant a relaunch on every single cold start once we began
   relaunching to apply the direction at all: boot decides "LTR, this device
   is English", prefs land and ask for Hebrew, next boot decides LTR again.

   So the chosen language is cached here on the way out and read on the way
   in, exactly like the palette. This module deliberately imports nothing —
   index.js reaches it before the palette is applied, and anything it pulled
   in would evaluate its stylesheets too early. */

export const LANG_KEY = 'mg-lang'

let bootLanguage = null

/** index.js, once AsyncStorage has answered. */
export function setBootLanguage(lang) {
  bootLanguage = lang || null
}

/** setupI18n, in place of the device locale when the user has chosen. */
export function getBootLanguage() {
  return bootLanguage
}

/* The two decisions that follow from all this, kept here as plain functions
   of their inputs rather than inline in the modules that act on them — both
   are one line and both were wrong for a long time, which is exactly the
   shape that deserves a test it can actually have. */

/** The language this session runs in: the saved choice if it is one we ship. */
export function pickLanguage(saved, device, supported) {
  return supported.includes(saved) ? saved : device
}

/** Whether only a relaunch can give this session the direction it needs.
    Web is excluded because forceRTL is a documented no-op there: the answer
    would never change and reloadApp() would loop the page forever. */
export function rtlRelaunchNeeded({ platform, isRTL, wantRtl }) {
  return platform !== 'web' && isRTL !== wantRtl
}

/** Whether to spend the one relaunch allowed for this direction. `tried` is
    the last direction we relaunched for, so a forceRTL that never takes
    costs one extra launch instead of every launch from now on. */
export function shouldRelaunchForRtl(tried, want) {
  return tried !== want
}
