import { useTranslation } from 'react-i18next'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { APP_LANGS } from '@simplicity/core/i18n'
import './LanguageSwitcher.css'

/* ════════════════════════════════════════════════════════════════
   LanguageSwitcher — pill row to change the active UI language.
   Works pre-auth (login/landing) and post-auth:
     · always changes i18next (localStorage-cached by the detector)
     · also persists prefs.design.language when a prefs provider is
       present (post-auth) — pre-auth `update` is a harmless no-op stub.
   ════════════════════════════════════════════════════════════════ */
export default function LanguageSwitcher({ className = '' }) {
  const { i18n } = useTranslation()
  const { update } = useUserPreferences()
  const active = (i18n.language || 'he').split('-')[0]

  const pick = (code) => {
    if (code === active) return
    i18n.changeLanguage(code)
    update({ design: { language: code } })
  }

  return (
    <div className={`lang-switch ${className}`.trim()} role="group" aria-label="Language">
      {APP_LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code}
          aria-pressed={l.code === active}
          className={`lang-switch-opt${l.code === active ? ' on' : ''}`}
          onClick={() => pick(l.code)}
        >
          {l.name}
        </button>
      ))}
    </div>
  )
}
