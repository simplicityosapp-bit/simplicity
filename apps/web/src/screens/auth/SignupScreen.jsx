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
import { trackSignupComplete } from '../../lib/api/landingEvents'
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
  /* The consent error renders next to the checkboxes, NOT in the form's
     top error slot — up there it sits above the email field and gets
     missed. Raised only on a submit attempt, and it clears itself the
     moment the boxes are ticked (canConsent flips true). */
  const [consentTried, setConsentTried] = useState(false)
  const showConsentErr = consentTried && !canConsent

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
      setConsentTried(true)
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
      /* Signing up with an address that already has an account does NOT come
         back as an error: Supabase's email-enumeration protection returns a
         success so an attacker can't probe which addresses are registered.
         Taking that at face value showed "check your inbox" for a mail that
         is never sent, and the person waits for it.
         The tell is an empty identities array — a real new signup always has
         one. Same message the error path uses, so we don't leak anything the
         user couldn't already find by trying to log in. */
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setError(translateAuthError('already registered'))
        return
      }
      /* A real new account exists from here on (the already-registered case
         returned above), so close the landing funnel: view -> signup_start ->
         signup_complete on the same session id. Deliberately AFTER the
         identities check, so a probe of an existing address is not counted as
         a signup. Cannot throw and does not block the redirect below. */
      trackSignupComplete()
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
          {/* Says which of the two near-identical screens this is, and says
              what the button is about to do — until now the first news that
              a confirmation mail was coming arrived on the screen after it. */}
          <Txt as="h1" className="auth-title">{t('signupScreen.title')}</Txt>
          <Txt as="p" className="auth-sub">{t('signupScreen.subtitle')}</Txt>
          {error && <Txt as="p" className="auth-error" role="alert">{error}</Txt>}

          <Box className="auth-group">
            {/* The name of the field, on the page, staying there — it used to
                live in the placeholder, which is to say it left the moment
                anyone typed. A sibling of the field, not its parent: see
                AuthScreen.css for why that decides whether a screen reader
                hears anything at all. */}
            <Txt as="label" className="auth-label" htmlFor="signup-email">{t('emailPlaceholder')}</Txt>
            <Box as="label" className="auth-field" htmlFor="signup-email">
              <Txt className="auth-field-icon"><Mail size={16} strokeWidth={1.6} aria-hidden="true" /></Txt>
              <Input
                id="signup-email"
                type="email"
                dir="ltr"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Box>
          </Box>

          <Box className="auth-group">
            <Txt as="label" className="auth-label" htmlFor="signup-pass">{t('passwordPlaceholder')}</Txt>
            <Box as="label" className="auth-field" htmlFor="signup-pass">
              <Txt className="auth-field-icon"><Lock size={16} strokeWidth={1.6} aria-hidden="true" /></Txt>
              <Input
                id="signup-pass"
                type={showPassword ? 'text' : 'password'}
                dir="ltr"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                /* With the label saying what the box is, the placeholder is
                   free to go back to being the hint it was written as. */
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

          {showConsentErr && (
            <Txt as="p" className="auth-error" role="alert">{t('signupScreen.mustAccept')}</Txt>
          )}

          {/* Stays enabled without consent on purpose: submitting runs the
              consent guard in submit(), which raises showConsentErr and
              explains WHY signup is blocked. Disabling it here left the form
              silent and looking broken. The guard still runs before any auth
              call, so consent is never bypassed. */}
          <Btn className="auth-btn auth-btn-primary" type="submit" disabled={busy}>
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
