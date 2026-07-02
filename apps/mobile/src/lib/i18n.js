// Mobile i18n bootstrap — the ENGINE + all strings live in @simplicity/core;
// this is just the platform glue (pick the language from the device locale and
// set layout direction). Web has the equivalent in apps/web/src/i18n/init.js.
import i18n, { initI18n } from '@simplicity/core/i18n'
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
  return i18n
}

export default i18n
