import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ROUTES } from '../../lib/routes'
import { translateAuthError } from '../../auth/authErrors'
import GoogleButton from '../../auth/GoogleButton'
import { useT } from '../../i18n/useT'
import LanguageSwitcher from '../../i18n/LanguageSwitcher'
import './AuthScreen.css'

export default function LoginScreen() {
  const { t } = useT('auth')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email || !password) {
      setError(t('fillEmailPassword'))
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError(translateAuthError(error.message))
    // On success the AuthProvider switches the app to the authenticated view.
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
          {error && <p className="auth-error">{error}</p>}

          <label className="auth-field" htmlFor="login-email">
            <span className="auth-field-icon"><Mail size={16} strokeWidth={1.6} aria-hidden="true" /></span>
            <input
              id="login-email"
              type="email"
              dir="ltr"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
            />
          </label>

          <label className="auth-field" htmlFor="login-pass">
            <span className="auth-field-icon"><Lock size={16} strokeWidth={1.6} aria-hidden="true" /></span>
            <input
              id="login-pass"
              type={showPassword ? 'text' : 'password'}
              dir="ltr"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
            <button
              type="button"
              className="auth-field-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
            >
              {showPassword
                ? <EyeOff size={16} strokeWidth={1.6} aria-hidden="true" />
                : <Eye size={16} strokeWidth={1.6} aria-hidden="true" />}
            </button>
          </label>

          <button className="auth-btn auth-btn-primary" type="submit" disabled={busy}>
            {busy ? t('loggingIn') : t('login')}
          </button>

          <div className="auth-divider"><span>{t('or')}</span></div>

          <GoogleButton onError={setError} />

          <Link to={ROUTES.RESET_PASSWORD} className="auth-link-sm">{t('forgotPassword')}</Link>
        </form>

        <p className="auth-foot">{t('noAccount')} <Link to={ROUTES.SIGNUP} className="auth-foot-cta">{t('signup')}</Link></p>

        <LanguageSwitcher className="auth-langs" />
      </div>
    </div>
  )
}
