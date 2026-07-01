import i18n from '@simplicity/core/i18n'
import heGuidance from '../i18n/locales/he/guidance.json'
import enGuidance from '../i18n/locales/en/guidance.json'
import esGuidance from '../i18n/locales/es/guidance.json'
import frGuidance from '../i18n/locales/fr/guidance.json'

/* ════════════════════════════════════════════════════════════════
   Coachmark registry — first-touch guidance copy.
   ════════════════════════════════════════════════════════════════
   Each known coachmark id (stored in prefs.coachmarks once the user
   interacts) maps to two guidance strings, resolved via i18n
   (namespace 'guidance', key guidance:coachmark.<id>.{bubble,detail}):
     - bubble:  one short line shown next to the glowing button.
     - detail:  a fuller explanation revealed when the empty-state
                reminder is expanded.
   Both address the user directly, so gendered forms live in the he
   JSON as i18next `context` variants (_male/_female) over a neutral
   base; coachmarkText(id, gender) passes the context. A button is
   "virgin" (glows + shows its bubble) while its id is absent from
   prefs.coachmarks; the first interaction marks it seen for good.

   The 'guidance' namespace is registered here (not in i18n/index.js)
   so this lib stays self-contained — addResourceBundle is idempotent
   for our purposes (same content), and tours.js registers the same.
   ════════════════════════════════════════════════════════════════ */

i18n.addResourceBundle('he', 'guidance', heGuidance, true, false)
i18n.addResourceBundle('en', 'guidance', enGuidance, true, false)
i18n.addResourceBundle('es', 'guidance', esGuidance, true, false)
i18n.addResourceBundle('fr', 'guidance', frGuidance, true, false)

const COACHMARK_IDS = ['add-task', 'add-lead', 'add-lead-page', 'add-project', 'add-goal', 'add-transaction', 'add-meeting']

export function coachmarkText(id, gender) {
  if (!COACHMARK_IDS.includes(id)) return { bubble: '', detail: '' }
  const context = gender === 'male' || gender === 'female' ? { context: gender } : undefined
  return {
    bubble: i18n.t(`guidance:coachmark.${id}.bubble`, context),
    detail: i18n.t(`guidance:coachmark.${id}.detail`, context),
  }
}
