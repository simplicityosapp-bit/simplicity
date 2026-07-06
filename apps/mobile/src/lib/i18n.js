// Mobile i18n bootstrap — the ENGINE + all strings live in @simplicity/core;
// this is just the platform glue (pick the language from the device locale and
// set layout direction). Web has the equivalent in apps/web/src/i18n/init.js.
import i18n, { initI18n } from '@simplicity/core/i18n'
import { registerReflections } from '@simplicity/core/i18n/reflections'
import { registerQuotes } from '../i18n/registerQuotes'
import { registerPresets } from '../i18n/registerPresets'
import { getLocales } from 'expo-localization'
import { I18nManager } from 'react-native'

const SUPPORTED = ['he', 'en', 'es', 'fr']

function deviceLang() {
  try {
    const code = getLocales?.()?.[0]?.languageCode
    return SUPPORTED.includes(code) ? code : 'he'
  } catch {
    return 'he'
  }
}

// Call once at startup, before the first render. Idempotent (initI18n guards).
export function setupI18n() {
  const lng = deviceLang()
  initI18n({ lng, dev: __DEV__ })
  // Register the dynamic 'reflections' namespace (moon/mirror reflection text)
  // AFTER init. The module's import-time side-effect runs before init on native
  // (whole import graph loads first), so mobile must call this explicitly here.
  registerReflections()
  // Register the localized daily-quote pools (see registerQuotes for why this
  // is deferred to here on native rather than an import-time side-effect).
  registerQuotes()
  // Goal-category preset display strings (see registerPresets).
  registerPresets()
  // Hebrew is RTL. Note: a native RTL flip only fully applies after an app reload
  // (RN limitation); on the first install the layout may need one restart.
  const rtl = lng === 'he'
  if (I18nManager.isRTL !== rtl) {
    try {
      I18nManager.allowRTL(rtl)
      I18nManager.forceRTL(rtl)
    } catch {
      /* no-op — some platforms (web) ignore forceRTL */
    }
  }
  installGenderContext()
  return i18n
}

// ── Gender-aware translation ────────────────────────────────────────────────
// Web routes every string through the useT() hook, which injects the signed-in
// user's form of address (prefs.design.gender) as i18next `context` so
// t('addClient') resolves to addClient_male / addClient_female / addClient.
// Mobile has no such hook — 450+ call sites use the i18n.t singleton directly —
// so we make the singleton itself gender-aware: patch i18n.t once to default a
// `context` from the current gender. i18next falls back to the base key when no
// gendered variant exists, so keys without _male/_female are unaffected; neutral
// (or pre-auth) → no context → base key, exactly like web.
let _genderCtx // 'male' | 'female' | undefined
let _genderPatched = false

// Set the address form. Call on prefs load and when the user changes it in
// Settings. Screens already on-screen won't re-run t() until they re-render
// (navigation / a state change) — gender is a set-once preference, like web.
export function setGenderContext(gender) {
  _genderCtx = gender === 'male' || gender === 'female' ? gender : undefined
}

function installGenderContext() {
  if (_genderPatched) return
  _genderPatched = true
  const rawT = i18n.t.bind(i18n)
  i18n.t = function gendered(key, opts, opts3) {
    if (!_genderCtx) return rawT(key, opts, opts3)
    // t(key, defaultValue: string, options?)
    if (typeof opts === 'string') return rawT(key, opts, { context: _genderCtx, ...(opts3 || {}) })
    // t(key)
    if (opts == null) return rawT(key, { context: _genderCtx })
    // t(key, { options }) — don't clobber an explicit context override
    if (typeof opts === 'object' && opts.context === undefined) return rawT(key, { context: _genderCtx, ...opts })
    return rawT(key, opts, opts3)
  }
}

export default i18n
