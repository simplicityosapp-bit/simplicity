import i18n from '@simplicity/core/i18n'
import hePresets from './presets/he.json'
import enPresets from './presets/en.json'
import esPresets from './presets/es.json'
import frPresets from './presets/fr.json'

// Register the goal-category preset display strings as a dynamic `presets`
// namespace — same deferred pattern as registerQuotes/registerReflections
// (native loads the import graph before setupI18n, so this must be called after
// initI18n, not at import time). Pools copied from apps/web.
export function registerPresets() {
  if (typeof i18n.hasResourceBundle !== 'function') return
  if (!i18n.hasResourceBundle('he', 'presets')) i18n.addResourceBundle('he', 'presets', hePresets, true, true)
  if (!i18n.hasResourceBundle('en', 'presets')) i18n.addResourceBundle('en', 'presets', enPresets, true, true)
  if (!i18n.hasResourceBundle('es', 'presets')) i18n.addResourceBundle('es', 'presets', esPresets, true, true)
  if (!i18n.hasResourceBundle('fr', 'presets')) i18n.addResourceBundle('fr', 'presets', frPresets, true, true)
}
