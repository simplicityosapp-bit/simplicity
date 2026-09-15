import { useCallback } from 'react'
import { resolveMessage } from '@simplicity/core'
import { usePreferences } from '../lib/preferences'
import i18n from '../lib/i18n'

/* ════════════════════════════════════════════════════════════════
   useWhatsAppMessage — the prefilled text for a WhatsApp send.
   ════════════════════════════════════════════════════════════════
   Port of web's hook of the same name, and the same single source:
     • the localized defaults in components:whatsapp.defaults
     • the coach's own overrides in prefs.whatsapp.templates
   build(key, vars) → the custom template filled in when one is set,
   otherwise the default for that key; both use {{token}} placeholders.

   The phone's Connections screen has let the coach edit these templates
   for a while, and nothing on the phone read them: the payment request
   sent a hard-coded line and every other WhatsApp button opened an empty
   chat. Templates saved on the phone now reach the phone.
   ════════════════════════════════════════════════════════════════ */
export function useWhatsAppMessage() {
  const { prefs } = usePreferences()
  const templates = prefs?.whatsapp?.templates
  return useCallback(
    (key, vars = {}) => resolveMessage((templates || {})[key], vars, i18n.t(`components:whatsapp.defaults.${key}`, vars)),
    [templates],
  )
}
