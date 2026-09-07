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
import { Box, Txt, Btn, Input } from '../../components/ui'

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

  /* Both complaints belong beside the box that caused them, not in the slot at
     the top of the form — the same arrangement signup already uses. The rule
     for the new password is on the page from the start; the mismatch has
     nothing to say until there is something to compare, so its line appears
     only when it does. Raised on blur, and by a submit attempt, and each one
     clears itself the moment its field is right. */
  const [pwBlurred, setPwBlurred] = useState(false)
  const [confirmTouched, setConfirmTouched] = useState(false)
  const pwIssue = checkPasswordStrength(password)
  const showPwIssue = pwBlurred && password.length > 0 && !!pwIssue
  const showMismatch = confirmTouched && password !== confirm

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (pwIssue) { setPwBlurred(true); return }
    if (password !== confirm) { setConfirmTouched(true); return }
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) { setError(translateAuthError(error.message)); return }
      setDone(true)
    } catch (err) {
      setError(translateAuthError(err?.message))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Box className="auth-wrap">
        <Box className="auth-bg" aria-hidden="true" />
        <Box className="auth-stage">
          <Box className="auth-brand">
            <img className="auth-logo light" src="/logo-dark.png" alt="" aria-hidden="true" />
            <img className="auth-logo dark"  src="/logo-light.png" alt="" aria-hidden="true" />
            <img className="auth-name light" src="/name-dark.png" alt="simplicity" />
            <img className="auth-name dark"  src="/name-light.png" alt="simplicity" />
          </Box>
          <Box className="auth-form auth-msg-card">
            <Txt className="auth-msg-icon"><CheckCircle2 size={34} strokeWidth={1.4} aria-hidden="true" /></Txt>
            <Txt as="h1" className="auth-title">{t('update.doneTitle')}</Txt>
            <Txt as="p" className="auth-sub">{t('update.doneBody')}</Txt>
            <Btn type="button" className="auth-btn auth-btn-primary" onClick={() => { clearRecovery?.(); navigate(ROUTES.HOME, { replace: true }) }}>{t('update.continue')}</Btn>
          </Box>
        </Box>
      </Box>
    )
  }

  return (
    <Box className="auth-wrap">
      <Box className="auth-bg" aria-hidden="true" />
      <Box className="auth-stage">
        <Box className="auth-brand">
          <img className="auth-logo light" src="/logo-dark.png" alt="" aria-hidden="true" />
          <img className="auth-logo dark"  src="/logo-light.png" alt="" aria-hidden="true" />
          <img className="auth-name light" src="/name-dark.png" alt="simplicity" />
          <img className="auth-name dark"  src="/name-light.png" alt="simplicity" />
        </Box>

        <Box as="form" className="auth-form" onSubmit={submit}>
          <Txt as="h1" className="auth-title">{t('update.title')}</Txt>
          <Txt as="p" className="auth-sub">{t('update.subtitle')}</Txt>

          {error && <Txt as="p" className="auth-error" role="alert">{error}</Txt>}

          <Box className="auth-group">
            <Txt as="label" className="auth-label" htmlFor="new-password">{t('update.newPasswordLabel')}</Txt>
            <Box as="label" className="auth-field" htmlFor="new-password">
              <Txt className="auth-field-icon"><Lock size={16} strokeWidth={1.6} aria-hidden="true" /></Txt>
              <Input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                dir="ltr"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setPwBlurred(true)}
                aria-describedby="new-password-hint"
                aria-invalid={showPwIssue || undefined}
              />
              <Btn
                type="button"
                className="auth-field-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('hidePassword') : t('showPassword')}
              >
                {showPassword
                  ? <EyeOff size={16} strokeWidth={1.6} aria-hidden="true" />
                  : <Eye size={16} strokeWidth={1.6} aria-hidden="true" />}
              </Btn>
            </Box>
            <Txt
              as="p"
              id="new-password-hint"
              className={showPwIssue ? 'auth-hint auth-hint-bad' : 'auth-hint'}
              aria-live="polite"
            >
              {showPwIssue
                ? t(pwIssue === 'tooCommon' ? 'update.pwTooCommon' : 'update.pwTooShort')
                : t('min8chars')}
            </Txt>
          </Box>

          <Box className="auth-group">
            <Txt as="label" className="auth-label" htmlFor="confirm-password">{t('update.confirmLabel')}</Txt>
            <Box as="label" className="auth-field" htmlFor="confirm-password">
              <Txt className="auth-field-icon"><Lock size={16} strokeWidth={1.6} aria-hidden="true" /></Txt>
              <Input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                dir="ltr"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                /* Only once there is something to compare — a mismatch quoted
                   at someone one character in is noise. A submit sets it too,
                   so an empty box is not refused in silence. */
                onBlur={() => { if (confirm.length > 0) setConfirmTouched(true) }}
                aria-describedby={showMismatch ? 'confirm-password-hint' : undefined}
                aria-invalid={showMismatch || undefined}
              />
            </Box>
            {showMismatch && (
              <Txt as="p" id="confirm-password-hint" className="auth-hint auth-hint-bad" aria-live="polite">
                {t('update.mismatch')}
              </Txt>
            )}
          </Box>

          <Btn className="auth-btn auth-btn-primary" type="submit" disabled={busy}>
            {busy ? t('update.updating') : t('update.updatePassword')}
          </Btn>
        </Box>
      </Box>
    </Box>
  )
}
