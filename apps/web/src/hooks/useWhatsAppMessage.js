import { useUserPreferences } from './useUserPreferences'
import { useT } from '../i18n/useT'
import { resolveMessage } from '../lib/whatsapp'

/* ════════════════════════════════════════════════════════════════
   useWhatsAppMessage — resolve a send surface's prefilled message.
   ════════════════════════════════════════════════════════════════
   Single source of truth for WhatsApp message text:
     • the localized DEFAULT templates live in components:whatsapp.defaults
     • the coach's CUSTOM overrides live in prefs.whatsapp.templates
   Returns a builder: build(key, vars) → the custom template (filled)
   when set, otherwise the localized default for that key. Both share
   the same {{token}} placeholders, so they're interchangeable.

     const waMsg = useWhatsAppMessage()
     <WhatsAppButton message={waMsg('client', { name })} />

   `key` is the default key (e.g. 'client', 'receiptNoName'); custom
   overrides only exist for the primary keys the editor exposes, so
   *NoName variants always resolve to the built-in default.
   ════════════════════════════════════════════════════════════════ */
export function useWhatsAppMessage() {
  const { t } = useT('components')
  const { prefs } = useUserPreferences()
  const templates = prefs?.whatsapp?.templates || {}
  return (key, vars = {}) => resolveMessage(templates[key], vars, t(`whatsapp.defaults.${key}`, vars))
}
