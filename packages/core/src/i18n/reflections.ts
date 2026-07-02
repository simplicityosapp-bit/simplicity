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

/* Register the 4 reflections bundles into the i18n singleton. Idempotent
   (skips already-present bundles) and guarded against an uninitialized i18n —
   in non-init contexts (e.g. pure-logic unit tests importing the barrel) it
   simply skips instead of crashing.

   Exported AND called on import: web consumers rely on the import side-effect
   (they load this module AFTER initI18n, so it registers straight away). Native
   (mobile) loads the whole import graph BEFORE its setupI18n() runs, so the
   import-time call lands before init and is lost — mobile therefore calls
   registerReflections() explicitly right after initI18n(). */
export function registerReflections(): void {
  if (typeof i18n.hasResourceBundle !== 'function') return
  if (!i18n.hasResourceBundle('he', 'reflections')) i18n.addResourceBundle('he', 'reflections', heReflections, true, true)
  if (!i18n.hasResourceBundle('en', 'reflections')) i18n.addResourceBundle('en', 'reflections', enReflections, true, true)
  if (!i18n.hasResourceBundle('es', 'reflections')) i18n.addResourceBundle('es', 'reflections', esReflections, true, true)
  if (!i18n.hasResourceBundle('fr', 'reflections')) i18n.addResourceBundle('fr', 'reflections', frReflections, true, true)
}

registerReflections()
