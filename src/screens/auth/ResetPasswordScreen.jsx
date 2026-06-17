import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trans } from 'react-i18next'
import { Mail, MailCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ROUTES } from '../../lib/routes'
import { translateAuthError } from '../../auth/authErrors'
import { useT } from '../../i18n/useT'
import './AuthScreen.css'

export default function ResetPasswordScreen() {
  const { t } = useT('auth')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email) {
      setError(t('reset.fillEmail'))
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${ROUTES.UPDATE_PASSWORD}`,
    })
    setBusy(false)
    if (error) setError(translateAuthError(error.message))
    else setSent(true)
  }

  if (sent) {
    return (
      <div className="auth-wrap">
        <div className="auth-bg" aria-hidden="true" />
        <div className="auth-stage">
          <div className="auth-brand">
            <img className="auth-logo light" src="/logo-dark.png" alt="" aria-hidden="true" />
            <img className="auth-logo dark"  src="/logo-light.png" alt="" aria-hidden="true" />
            <img className="auth-name light" src="/name-dark.png" alt="simplicity" />
            <img className="auth-name dark"  src="/name-light.png" alt="simplicity" />
          </div>
          <div className="auth-form auth-msg-card">
            <span className="auth-msg-icon"><MailCheck size={34} strokeWidth={1.4} aria-hidden="true" /></span>
            <p className="auth-title">{t('reset.sentTitle')}</p>
            <p className="auth-sub">
              <Trans t={t} i18nKey="reset.sentBody" values={{ email }} components={[<bdi key="e" />]} />
            </p>
            <Link to={ROUTES.LOGIN} className="auth-btn auth-btn-primary">{t('backToLogin')}</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-wrap">
      <div className="auth-bg" aria-hidden="true" />
      <div className="auth-stage">
        <div className="auth-brand">
          <img className="auth-logo light" src="/logo-dark.png" alt="" aria-hidden="true" />
          <img className="auth-logo dark"  src="/logo-light.png" alt="" aria-hidden="true" />
          <img className="auth-name light" src="/name-dark.png" alt="simplicity" />
          <img className="auth-name dark"  src="/name-light.png" alt="simplicity" />
        </div>

        <form className="auth-form" onSubmit={submit}>
          <p className="auth-title">{t('reset.title')}</p>
          <p className="auth-sub">{t('reset.subtitle')}</p>

          {error && <p className="auth-error">{error}</p>}

          <label className="auth-field" htmlFor="reset-email">
            <span className="auth-field-icon"><Mail size={16} strokeWidth={1.6} aria-hidden="true" /></span>
            <input
              id="reset-email"
              type="email"
              dir="ltr"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
            />
          </label>

          <button className="auth-btn auth-btn-primary" type="submit" disabled={busy}>
            {busy ? t('reset.sending') : t('reset.sendLink')}
          </button>

          <p className="auth-foot"><Link to={ROUTES.LOGIN} className="auth-foot-cta">{t('backToLogin')}</Link></p>
        </form>
      </div>
    </div>
  )
}
