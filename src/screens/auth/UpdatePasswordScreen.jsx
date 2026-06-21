import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ROUTES } from '../../lib/routes'
import { translateAuthError } from '../../auth/authErrors'
import { checkPasswordStrength } from '../../lib/passwordStrength'
import { useAuth } from '../../auth/AuthContext'
import { useT } from '../../i18n/useT'
import './AuthScreen.css'

/* Completion screen for the password-reset flow. The recovery email links to
   /update-password, where Supabase has already exchanged the recovery token
   into a session (detectSessionInUrl). Here the user actually sets a NEW
   password via updateUser({ password }). Without this screen the reset flow
   was a dead end — the link logged the user in but never let them change it.
   Doubles as a "change password" screen for any signed-in user. */
export default function UpdatePasswordScreen() {
  const navigate = useNavigate()
  const { clearRecovery } = useAuth()
  const { t } = useT('auth')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const pwIssue = checkPasswordStrength(password)
    if (pwIssue === 'tooShort') { setError(t('update.pwTooShort')); return }
    if (pwIssue === 'tooCommon') { setError(t('update.pwTooCommon')); return }
    if (password !== confirm) { setError(t('update.mismatch')); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) { setError(translateAuthError(error.message)); return }
    setDone(true)
  }

  if (done) {
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
            <span className="auth-msg-icon"><CheckCircle2 size={34} strokeWidth={1.4} aria-hidden="true" /></span>
            <p className="auth-title">{t('update.doneTitle')}</p>
            <p className="auth-sub">{t('update.doneBody')}</p>
            <button type="button" className="auth-btn auth-btn-primary" onClick={() => { clearRecovery?.(); navigate(ROUTES.HOME, { replace: true }) }}>{t('update.continue')}</button>
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
          <p className="auth-title">{t('update.title')}</p>
          <p className="auth-sub">{t('update.subtitle')}</p>

          {error && <p className="auth-error">{error}</p>}

          <label className="auth-field" htmlFor="new-password">
            <span className="auth-field-icon"><Lock size={16} strokeWidth={1.6} aria-hidden="true" /></span>
            <input
              id="new-password"
              type={showPassword ? 'text' : 'password'}
              dir="ltr"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('min8chars')}
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

          <label className="auth-field" htmlFor="confirm-password">
            <span className="auth-field-icon"><Lock size={16} strokeWidth={1.6} aria-hidden="true" /></span>
            <input
              id="confirm-password"
              type={showPassword ? 'text' : 'password'}
              dir="ltr"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t('update.confirmPlaceholder')}
            />
          </label>

          <button className="auth-btn auth-btn-primary" type="submit" disabled={busy}>
            {busy ? t('update.updating') : t('update.updatePassword')}
          </button>
        </form>
      </div>
    </div>
  )
}
