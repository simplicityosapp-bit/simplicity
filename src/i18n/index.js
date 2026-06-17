import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { DEFAULT_LANG, LANG_CODES } from './config'

/* ════════════════════════════════════════════════════════════════
   I18N INIT — react-i18next setup.
   ════════════════════════════════════════════════════════════════
   The active UI language is owned by i18next and cached in
   localStorage ('mg-lang') so it survives reloads and works BOTH
   pre-auth (login/landing) and post-auth. For signed-in users the
   persisted preference (prefs.design.language) reconciles into this
   via <I18nSync/>. Gender is applied per-call as i18next `context`
   (see useT.js). Add a namespace? import its 4 JSONs + register below.
   ════════════════════════════════════════════════════════════════ */

import heCommon from './locales/he/common.json'
import enCommon from './locales/en/common.json'
import esCommon from './locales/es/common.json'
import frCommon from './locales/fr/common.json'
import heAuth from './locales/he/auth.json'
import enAuth from './locales/en/auth.json'
import esAuth from './locales/es/auth.json'
import frAuth from './locales/fr/auth.json'

export const NAMESPACES = ['common', 'auth']

const resources = {
  he: { common: heCommon, auth: heAuth },
  en: { common: enCommon, auth: enAuth },
  es: { common: esCommon, auth: esAuth },
  fr: { common: frCommon, auth: frAuth },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: DEFAULT_LANG,
    supportedLngs: LANG_CODES,
    ns: NAMESPACES,
    defaultNS: 'common',
    interpolation: { escapeValue: false }, // React already escapes
    returnEmptyString: false,
    detection: {
      order: ['localStorage'],            // saved choice only; new visitors get fallback (he)
      caches: ['localStorage'],
      lookupLocalStorage: 'mg-lang',
    },
  })

/* DEV aid: expose the instance for console/preview debugging. Guarded by
   import.meta.env.DEV, so it's tree-shaken out of production builds. */
if (import.meta.env.DEV) {
  try { window.i18n = i18n } catch { /* noop */ }
}

export default i18n
