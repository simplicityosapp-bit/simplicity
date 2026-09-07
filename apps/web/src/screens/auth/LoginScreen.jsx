import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ROUTES } from '../../lib/routes'
import { translateAuthError, authErrorKey } from '../../auth/authErrors'
import GoogleButton from '../../auth/GoogleButton'
import ResendConfirmation from '../../auth/ResendConfirmation'
import { useT } from '../../i18n/useT'
import LanguageSwitcher from '../../i18n/LanguageSwitcher'
import './AuthScreen.css'
import { Box, Txt, Btn, Input } from '../../components/ui'

export default function LoginScreen() {
  const { t } = useT('auth')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  /* Seeded from the redirect that sent us here — a dead password-reset link
     lands on login, and without this it did so with no explanation at all.
     Seeded rather than assigned, so typing and re-submitting clears it. */
  const { state } = useLocation()
  const [error, setError] = useState(state?.authError || '')
  /* The KIND of failure, kept alongside the sentence, because two of them have
     an obvious next move and the sentence alone cannot be matched on. A wrong
     password wants a way to reset one; an unconfirmed address wants the mail
     sent again — and that one was a wall with no door in it, since nothing in
     the app could send another. */
  const [errorKind, setErrorKind] = useState('')
  const [busy, setBusy] = useState(false)

  const fail = (msg) => {
    setError(translateAuthError(msg))
    setErrorKind(authErrorKey(msg))
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setErrorKind('')
    if (!email || !password) {
      setError(t('fillEmailPassword'))
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) fail(error.message)
      // On success the AuthProvider switches the app to the authenticated view.
    } catch (err) {
      fail(err?.message)
    } finally {
      setBusy(false)
    }
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
          {/* Login and signup were the same picture — a wordmark and two
              boxes — and the only thing telling them apart was the small
              print at the foot. The page says which one it is now, and as
              the page's h1, so it is the first thing read aloud too. */}
          <Txt as="h1" className="auth-title">{t('login')}</Txt>
          {/* role="alert": a wrong password is announced, not just drawn. */}
          {error && (
            <Txt as="p" className="auth-error" role="alert">
              {error}
              {errorKind === 'invalidLogin' && (
                <Link to={ROUTES.RESET_PASSWORD} className="auth-error-cta">{t('forgotPassword')}</Link>
              )}
            </Txt>
          )}
          {/* The mail never arrived, or was deleted, or went to spam. Offered
              here rather than only after signing up, because this is where
              someone who signed up days ago comes back and finds the door
              shut. */}
          {errorKind === 'emailNotConfirmed' && <ResendConfirmation email={email} />}

          <Box className="auth-group">
            {/* The name of the field, on the page, staying there. It used to
                live in the placeholder — which is to say it left as soon as
                anyone typed. */}
            <Txt as="label" className="auth-label" htmlFor="login-email">{t('emailPlaceholder')}</Txt>
            <Box as="label" className="auth-field" htmlFor="login-email">
              <Txt className="auth-field-icon"><Mail size={16} strokeWidth={1.6} aria-hidden="true" /></Txt>
              <Input
                id="login-email"
                type="email"
                dir="ltr"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Box>
          </Box>

          <Box className="auth-group">
            <Txt as="label" className="auth-label" htmlFor="login-pass">{t('passwordPlaceholder')}</Txt>
            <Box as="label" className="auth-field" htmlFor="login-pass">
              <Txt className="auth-field-icon"><Lock size={16} strokeWidth={1.6} aria-hidden="true" /></Txt>
              <Input
                id="login-pass"
                type={showPassword ? 'text' : 'password'}
                dir="ltr"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
          </Box>

          <Btn className="auth-btn auth-btn-primary" type="submit" disabled={busy}>
            {busy ? t('loggingIn') : t('login')}
          </Btn>

          <Box className="auth-divider"><Txt>{t('or')}</Txt></Box>

          <GoogleButton onError={setError} label={t('googleLogin')} />

          <Link to={ROUTES.RESET_PASSWORD} className="auth-link-sm">{t('forgotPassword')}</Link>
        </Box>

        <Txt as="p" className="auth-foot">{t('noAccount')} <Link to={ROUTES.SIGNUP} className="auth-foot-cta">{t('signup')}</Link></Txt>

        <LanguageSwitcher className="auth-langs" />
      </Box>
    </Box>
  )
}
