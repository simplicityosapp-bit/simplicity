import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { dirFor } from './config'

/* ════════════════════════════════════════════════════════════════
   DirManager — keeps <html lang/dir> in sync with the active language.
   Mounted at the App root (OUTSIDE the auth/prefs providers) so the
   direction flips on every screen, logged in or out. Renders nothing.
   ════════════════════════════════════════════════════════════════ */
export default function DirManager() {
  const { i18n } = useTranslation()
  const lang = i18n.language

  useEffect(() => {
    const code = (lang || 'he').split('-')[0]
    const el = document.documentElement
    el.setAttribute('lang', code)
    el.setAttribute('dir', dirFor(code))
  }, [lang])

  return null
}
