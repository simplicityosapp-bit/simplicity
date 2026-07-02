/* ════════════════════════════════════════════════════════════════
   REFLECTIONS — dynamic i18n namespace (owned by insights + moon in
   core, and profileHealth in apps/web).
   ════════════════════════════════════════════════════════════════
   Registered here as a side-effect on import, so `i18n.t('reflections:…')`
   resolves. Deliberately kept OUT of initI18n's static resources so it stays
   LAZY — the 4 JSONs are only bundled/loaded when a consumer imports this
   module. addResourceBundle deep-merges and is idempotent, so every consumer
   can import this safely (import '@simplicity/core/i18n/reflections' from web,
   or '../i18n/reflections' from a core domain module).
   ════════════════════════════════════════════════════════════════ */

import i18n from './index'
import heReflections from './locales/he/reflections.json'
import enReflections from './locales/en/reflections.json'
import esReflections from './locales/es/reflections.json'
import frReflections from './locales/fr/reflections.json'

/* Guard against an uninitialized i18n: hasResourceBundle/addResourceBundle only
   exist after initI18n() has run (the web app inits at startup before any consumer
   loads). In non-init contexts — e.g. the pure-logic unit tests that import the
   @simplicity/core barrel — this simply skips registration instead of crashing. */
if (typeof i18n.hasResourceBundle === 'function') {
  if (!i18n.hasResourceBundle('he', 'reflections')) i18n.addResourceBundle('he', 'reflections', heReflections, true, true)
  if (!i18n.hasResourceBundle('en', 'reflections')) i18n.addResourceBundle('en', 'reflections', enReflections, true, true)
  if (!i18n.hasResourceBundle('es', 'reflections')) i18n.addResourceBundle('es', 'reflections', esReflections, true, true)
  if (!i18n.hasResourceBundle('fr', 'reflections')) i18n.addResourceBundle('fr', 'reflections', frReflections, true, true)
}
