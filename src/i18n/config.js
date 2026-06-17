/* ════════════════════════════════════════════════════════════════
   I18N CONFIG — supported languages + text direction.
   Single source of truth for the app's language list. No dependencies
   so it can be imported anywhere (preferences, switcher, init) without
   cycles.
   ════════════════════════════════════════════════════════════════ */

export const APP_LANGS = [
  { code: 'he', name: 'עברית',    dir: 'rtl' },
  { code: 'en', name: 'English',  dir: 'ltr' },
  { code: 'es', name: 'Español',  dir: 'ltr' },
  { code: 'fr', name: 'Français', dir: 'ltr' },
]

export const DEFAULT_LANG = 'he'

export const LANG_CODES = APP_LANGS.map((l) => l.code)

export function isLang(code) {
  return APP_LANGS.some((l) => l.code === code)
}

export function dirFor(code) {
  const l = APP_LANGS.find((x) => x.code === code)
  return l ? l.dir : 'rtl'
}
