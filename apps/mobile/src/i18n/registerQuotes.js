import i18n from '@simplicity/core/i18n'
import heQuotes from './quotes/he.json'
import enQuotes from './quotes/en.json'
import esQuotes from './quotes/es.json'
import frQuotes from './quotes/fr.json'

// Register the localized daily-quote pools into the i18n singleton as a
// dynamic `quotes` namespace — same pattern as core's registerReflections().
// Guarded + idempotent. Native loads the whole import graph BEFORE setupI18n()
// runs, so this must be called explicitly right after initI18n() (not at
// import time, where i18n isn't ready yet). Pools copied from apps/web; unify
// into @simplicity/core if they drift.
export function registerQuotes() {
  if (typeof i18n.hasResourceBundle !== 'function') return
  if (!i18n.hasResourceBundle('he', 'quotes')) i18n.addResourceBundle('he', 'quotes', heQuotes, true, true)
  if (!i18n.hasResourceBundle('en', 'quotes')) i18n.addResourceBundle('en', 'quotes', enQuotes, true, true)
  if (!i18n.hasResourceBundle('es', 'quotes')) i18n.addResourceBundle('es', 'quotes', esQuotes, true, true)
  if (!i18n.hasResourceBundle('fr', 'quotes')) i18n.addResourceBundle('fr', 'quotes', frQuotes, true, true)
}
