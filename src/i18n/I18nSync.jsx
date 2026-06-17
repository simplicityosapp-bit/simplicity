import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { isLang } from './config'

/* ════════════════════════════════════════════════════════════════
   I18nSync — reconciles the persisted language preference into i18next.
   ════════════════════════════════════════════════════════════════
   Mounted INSIDE UserPreferencesProvider (authenticated app). The
   active language is normally owned by i18next + localStorage, so a
   pre-auth choice persists. But prefs.design.language is the durable,
   cross-device store: when it is explicitly set (non-null) and differs
   from the current language, we apply it (e.g. logging in on a new
   device). When it's null we do nothing — the local choice governs.
   Renders nothing.
   ════════════════════════════════════════════════════════════════ */
export default function I18nSync() {
  const { i18n } = useTranslation()
  const { prefs } = useUserPreferences()
  const pref = prefs?.design?.language

  useEffect(() => {
    if (isLang(pref) && pref !== i18n.language) {
      i18n.changeLanguage(pref)
    }
  }, [pref, i18n])

  return null
}
