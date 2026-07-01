/* ════════════════════════════════════════════════════════════════
   I18N CONFIG — supported languages + text direction.
   Single source of truth for the app's language list. No dependencies
   so it can be imported anywhere (preferences, switcher, init) without
   cycles.
   ════════════════════════════════════════════════════════════════ */

export type LangDir = 'rtl' | 'ltr'

export interface AppLang {
  code: string
  name: string
  dir: LangDir
}

export const APP_LANGS: readonly AppLang[] = [
  { code: 'he', name: 'עברית', dir: 'rtl' },
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'es', name: 'Español', dir: 'ltr' },
  { code: 'fr', name: 'Français', dir: 'ltr' },
]

export const DEFAULT_LANG = 'he'

export const LANG_CODES: string[] = APP_LANGS.map((l) => l.code)

/* {v,l} shape for the Settings <Segmented> language control. */
export const LANGUAGE_OPTIONS = APP_LANGS.map((l) => ({ v: l.code, l: l.name }))

export function isLang(code: string | null | undefined): boolean {
  return APP_LANGS.some((l) => l.code === code)
}

export function dirFor(code: string | null | undefined): LangDir {
  const l = APP_LANGS.find((x) => x.code === code)
  return l ? l.dir : 'rtl'
}
