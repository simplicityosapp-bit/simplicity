import { useNavigate } from 'react-router-dom'
import { UserPlus, ListTodo, UserSearch, X } from 'lucide-react'
import { ROUTES } from '../lib/routes'
import { useT } from '../i18n/useT'
import './HomeWelcome.css'

/* ════════════════════════════════════════════════════════════════
   HomeWelcome — first-run welcome card on the home dashboard.
   ════════════════════════════════════════════════════════════════
   Home has no Add CTA of its own, so this is where first-touch
   guidance lives on the home screen. Shown only while the user has
   zero clients (data-driven — it disappears once the first client
   exists). Each starter navigates to a screen whose Add button is
   glowing, so the guidance continues there.
   ════════════════════════════════════════════════════════════════ */

export default function HomeWelcome({ onDismiss }) {
  const navigate = useNavigate()
  const { t } = useT('home')
  const STARTERS = [
    { icon: UserPlus,   label: t('welcome.addClient'), to: ROUTES.CLIENTS },
    { icon: ListTodo,   label: t('welcome.addTask'), to: ROUTES.TASKS },
    { icon: UserSearch, label: t('welcome.addLead'), to: ROUTES.LEADS },
  ]
  return (
    <section className="home-welcome anim">
      {onDismiss && (
        <button
          type="button"
          className="home-welcome-close"
          onClick={onDismiss}
          aria-label={t('welcome.close')}
        >
          <X size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      )}
      <p className="home-welcome-eyebrow">{t('welcome.eyebrow')}</p>
      <h2 className="home-welcome-title">{t('welcome.title')}</h2>
      <p className="home-welcome-sub">
        {t('welcome.sub')}
      </p>
      <div className="home-welcome-actions">
        {STARTERS.map(({ icon: Icon, label, to }) => (
          <button
            key={to}
            type="button"
            className="home-welcome-btn"
            onClick={() => navigate(to)}
          >
            <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
