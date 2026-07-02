import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trans } from 'react-i18next'
import { Mail, Lock, Eye, EyeOff, MailCheck, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ROUTES } from '../../lib/routes'
import { translateAuthError } from '../../auth/authErrors'
import { checkPasswordStrength } from '../../lib/passwordStrength'
import GoogleButton from '../../auth/GoogleButton'
import { useT } from '../../i18n/useT'
import { buildConsent, stashPendingConsent } from '../../lib/legal'
import './AuthScreen.css'
import { Box, Txt, Btn, Input, Lnk } from '../../components/ui'

export default function SignupScreen() {
  const { t } = useT('auth')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [agreePolicies, setAgreePolicies] = useState(false) // privacy + DPA (one control, two consents)
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreeMarketing, setAgreeMarketing] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  /* All legal documents must be accepted before any signup path. */
  const canConsent = agreePolicies && agreeTerms

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email || !password) {
      setError(t('fillEmailPassword'))
      return
    }
    const pwIssue = checkPasswordStrength(password)
    if (pwIssue === 'tooShort') {
      setError(t('signupScreen.passwordMin8'))
      return
    }
    if (pwIssue === 'tooCommon') {
      setError(t('signupScreen.passwordTooCommon'))
      return
    }
    if (!canConsent) {
      setError(t('signupScreen.mustAccept'))
      return
    }
    setBusy(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: buildConsent({ marketing: agreeMarketing }) },
      })
      if (error) {
        setError(translateAuthError(error.message))
        return
      }
      if (!data.session) setSent(true)
    } catch (err) {
      setError(translateAuthError(err?.message))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
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
            <Txt className="auth-msg-icon"><MailCheck size={34} strokeWidth={1.4} aria-hidden="true" /></Txt>
            <Txt as="p" className="auth-title">{t('signupScreen.checkEmailTitle')}</Txt>
            <Txt as="p" className="auth-sub">{t('signupScreen.sentBody', { email })}</Txt>
            <Link to={ROUTES.LOGIN} className="auth-btn auth-btn-primary">{t('backToLogin')}</Link>
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
          {error && <Txt as="p" className="auth-error">{error}</Txt>}

          <Box as="label" className="auth-field" htmlFor="signup-email">
            <Txt className="auth-field-icon"><Mail size={16} strokeWidth={1.6} aria-hidden="true" /></Txt>
            <Input
              id="signup-email"
              type="email"
              dir="ltr"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
            />
          </Box>

          <Box as="label" className="auth-field" htmlFor="signup-pass">
            <Txt className="auth-field-icon"><Lock size={16} strokeWidth={1.6} aria-hidden="true" /></Txt>
            <Input
              id="signup-pass"
              type={showPassword ? 'text' : 'password'}
              dir="ltr"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('min8chars')}
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

          <Box className="auth-checks">
            <Box as="label" className="auth-check">
              <Input type="checkbox" checked={agreePolicies} onChange={(e) => setAgreePolicies(e.target.checked)} />
              <Txt className="auth-check-box" aria-hidden="true"><Check size={13} strokeWidth={3} /></Txt>
              <Txt className="auth-check-label">
                <Trans
                  t={t}
                  i18nKey="signupScreen.consentPolicies"
                  components={{
                    a1: <Lnk className="auth-check-link" href={ROUTES.PRIVACY} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} />,
                    a2: <Lnk className="auth-check-link" href={`${ROUTES.LEGAL}?tab=dpa`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} />,
                  }}
                />
              </Txt>
            </Box>
            <Box as="label" className="auth-check">
              <Input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} />
              <Txt className="auth-check-box" aria-hidden="true"><Check size={13} strokeWidth={3} /></Txt>
              <Txt className="auth-check-label">
                <Trans
                  t={t}
                  i18nKey="signupScreen.consentTerms"
                  components={{
                    a1: <Lnk className="auth-check-link" href={ROUTES.TERMS} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} />,
                  }}
                />
              </Txt>
            </Box>
            <Box as="label" className="auth-check">
              <Input type="checkbox" checked={agreeMarketing} onChange={(e) => setAgreeMarketing(e.target.checked)} />
              <Txt className="auth-check-box" aria-hidden="true"><Check size={13} strokeWidth={3} /></Txt>
              <Txt className="auth-check-label">
                {t('signupScreen.consentMarketing')}
              </Txt>
            </Box>
          </Box>

          <Btn className="auth-btn auth-btn-primary" type="submit" disabled={busy || !canConsent}>
            {busy ? t('signupScreen.creating') : t('signup')}
          </Btn>

          <Box className="auth-divider"><Txt>{t('or')}</Txt></Box>

          <GoogleButton
            onError={setError}
            label={t('signupScreen.googleSignup')}
            disabled={!canConsent}
            onBeforeAuth={() => stashPendingConsent(buildConsent({ marketing: agreeMarketing }))}
          />
        </Box>

        <Txt as="p" className="auth-foot">{t('signupScreen.haveAccount')} <Link to={ROUTES.LOGIN} className="auth-foot-cta">{t('login')}</Link></Txt>
      </Box>
    </Box>
  )
}
