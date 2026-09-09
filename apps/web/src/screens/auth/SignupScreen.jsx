import { useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Trans } from 'react-i18next'
import { Mail, Lock, Eye, EyeOff, MailCheck, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ROUTES } from '../../lib/routes'
import { translateAuthError } from '../../auth/authErrors'
import { checkPasswordStrength } from '@simplicity/core'
import GoogleButton from '../../auth/GoogleButton'
import { startGoogleOAuth } from '../../auth/googleOAuth'
import Modal from '../../modals/Modal'
import ResendConfirmation from '../../auth/ResendConfirmation'
import LanguageSwitcher from '../../i18n/LanguageSwitcher'
import { useT } from '../../i18n/useT'
import { buildConsent, stashPendingConsent } from '../../lib/legal'
import { trackSignupComplete } from '../../lib/api/landingEvents'
import './AuthScreen.css'
import { Box, Txt, Btn, Input, Lnk } from '../../components/ui'

export default function SignupScreen() {
  const { t } = useT('auth')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [agreePolicies, setAgreePolicies] = useState(false) // privacy + DPA (one control, two consents)
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreeMarketing, setAgreeMarketing] = useState(false)
  const [error, setError] = useState('')
  const [emailTaken, setEmailTaken] = useState(false)
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

  /* The two required consents now live in a dialog that opens on the click
     rather than in boxes above the button. Which click it was has to survive
     the dialog: a coach who came in through Google must leave through Google,
     not be handed back to the email form. A ref, not state — nothing renders
     from it, and it must be readable inside the confirm handler without
     waiting for a re-render. */
  const [consentOpen, setConsentOpen] = useState(false)
  const pendingPath = useRef(null) // 'email' | 'google'
  const location = useLocation()

  const askConsent = (path) => {
    pendingPath.current = path
    setConsentTried(false)
    setConsentOpen(true)
  }

  /* Closing without confirming un-ticks both boxes. While they lived on the
     form, ticking them WAS the consent and the button below acted on it; now
     the dialog's confirm is the act, and a tick on its own is only half of
     one. Keeping the ticks would let the next press of "הרשמה" sail straight
     past the dialog — the coach backs out of a consent dialog and the account
     is created anyway, without it ever being confirmed. The document links
     open in their own tab, so nothing is lost by asking the two questions
     again. */
  const dismissConsent = () => {
    setConsentOpen(false)
    setConsentTried(false)
    setAgreePolicies(false)
    setAgreeTerms(false)
    pendingPath.current = null
  }

  /* buildConsent stamps all three documents as accepted at the moment it is
     called, so nothing may reach it with a box unticked. This is the only
     door out of the dialog that continues, and it is guarded by the same
     canConsent the form used when the boxes lived on it. */
  const confirmConsent = async () => {
    if (!canConsent) {
      setConsentTried(true)
      return
    }
    setConsentOpen(false)
    const path = pendingPath.current
    pendingPath.current = null
    if (path === 'email') {
      await createAccount()
      return
    }
    if (path === 'google') {
      await startGoogleOAuth({
        from: location.state?.from,
        onBeforeAuth: () => stashPendingConsent(buildConsent({ marketing: agreeMarketing })),
        onError: setError,
      })
    }
  }

  /* Same idea for the password: the rule is on the page from the start, and
     when it is not met the SAME line says so — next to the field, not in the
     error slot above the email box. It used to be told twice and both times
     too late: the rule lived in the placeholder, which leaves the instant
     anyone types, and the complaint only arrived on a submit that failed.
     Raised on blur (a rule quoted at someone three characters in is nagging,
     not helping) and by a submit attempt, and it clears itself the moment the
     password is good enough. */
  const [pwBlurred, setPwBlurred] = useState(false)
  const pwIssue = checkPasswordStrength(password)
  const showPwIssue = pwBlurred && password.length > 0 && !!pwIssue

  /* The second field exists to catch a typo in the first, so it is judged on
     the same terms: raised on blur or on a submit attempt, never while the
     characters are still arriving, and it clears itself the moment the two agree. */
  const [confirmBlurred, setConfirmBlurred] = useState(false)
  const confirmMismatch = confirm !== password
  const showConfirmIssue = confirmBlurred && confirm.length > 0 && confirmMismatch

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setEmailTaken(false)
    if (!email || !password) {
      setError(t('fillEmailPassword'))
      return
    }
    if (pwIssue) {
      setPwBlurred(true)
      return
    }
    if (confirmMismatch) {
      setConfirmBlurred(true)
      return
    }
    if (!canConsent) {
      askConsent('email')
      return
    }
    await createAccount()
  }

  /* Everything past the guards, so the dialog's confirm can reach it too.
     Not the tail of submit(): by then the consents have been given somewhere
     else and there is no event left to prevent. */
  const createAccount = async () => {
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
        /* "That address is already registered. You can log in." — true, and
           until now the only way to act on it was to scroll past the whole
           form to the line at the foot. The message carries the door now. */
        setEmailTaken(true)
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
            <Txt as="h1" className="auth-title">{t('signupScreen.checkEmailTitle')}</Txt>
            <Txt as="p" className="auth-sub">{t('signupScreen.sentBody', { email })}</Txt>
            <Link to={ROUTES.LOGIN} className="auth-btn auth-btn-primary">{t('backToLogin')}</Link>
            {/* The two ways this screen used to be a dead end. Waiting for a
                mail that never came left nothing to press; and a typo in the
                address left nothing but the browser's Back button, which
                throws the form away. Going back to the form keeps every field
                as it was, so it is one correction and not a re-fill. */}
            <ResendConfirmation email={email} />
            <Btn type="button" className="auth-link-sm" onClick={() => setSent(false)}>
              {t('signupScreen.wrongEmail')}
            </Btn>
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
          {error && (
            <Txt as="p" className="auth-error" role="alert">
              {error}
              {emailTaken && <Link to={ROUTES.LOGIN} className="auth-error-cta">{t('login')}</Link>}
            </Txt>
          )}

          <Box className="auth-group">
            {/* The name of the field, on the page, staying there — it used to
                live in the placeholder, which is to say it left the moment
                anyone typed. */}
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
                /* No placeholder: the rule it used to carry is on the line
                   below now, where it stays put. */
                onBlur={() => setPwBlurred(true)}
                aria-describedby="signup-pass-hint"
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
              id="signup-pass-hint"
              className={showPwIssue ? 'auth-hint auth-hint-bad' : 'auth-hint'}
              aria-live="polite"
            >
              {showPwIssue
                ? t(pwIssue === 'tooCommon' ? 'signupScreen.passwordTooCommon' : 'signupScreen.passwordMin8')
                : t('min8chars')}
            </Txt>
          </Box>

          {/* Deliberately without an eye of its own: there is one password on
              this form and one control that reveals it, so this field follows
              showPassword rather than carrying a second button that toggles
              the same idea. */}
          <Box className="auth-group">
            <Txt as="label" className="auth-label" htmlFor="signup-confirm">{t('signupScreen.confirmPasswordLabel')}</Txt>
            <Box as="label" className="auth-field" htmlFor="signup-confirm">
              <Txt className="auth-field-icon"><Lock size={16} strokeWidth={1.6} aria-hidden="true" /></Txt>
              <Input
                id="signup-confirm"
                type={showPassword ? 'text' : 'password'}
                dir="ltr"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onBlur={() => setConfirmBlurred(true)}
                aria-describedby="signup-confirm-hint"
                aria-invalid={showConfirmIssue || undefined}
              />
            </Box>
            <Txt
              as="p"
              id="signup-confirm-hint"
              className={showConfirmIssue ? 'auth-hint auth-hint-bad' : 'auth-hint'}
              aria-live="polite"
            >
              {showConfirmIssue ? t('signupScreen.passwordsDoNotMatch') : t('signupScreen.confirmPasswordHint')}
            </Txt>
          </Box>

          {/* The two REQUIRED consents moved into the dialog below; this one
              stays. It is a preference, not a gate — nothing waits on it, and
              putting it behind a click would make an optional box look like
              another hurdle. */}
          <Box className="auth-checks">
            <Box as="label" className="auth-check">
              <Input type="checkbox" checked={agreeMarketing} onChange={(e) => setAgreeMarketing(e.target.checked)} />
              <Txt className="auth-check-box" aria-hidden="true"><Check size={15} strokeWidth={3} /></Txt>
              <Txt className="auth-check-label">
                {t('signupScreen.consentMarketing')}
              </Txt>
            </Box>
          </Box>

          {/* Stays enabled without consent on purpose: submitting runs the
              consent guard in submit(), which now opens the consent dialog
              rather than raising a line under boxes that are no longer there.
              Disabling it left the form silent and looking broken. The guard
              still runs before any auth call, so consent is never bypassed. */}
          <Btn className="auth-btn auth-btn-primary" type="submit" disabled={busy}>
            {busy ? t('signupScreen.creating') : t('signup')}
          </Btn>

          <Box className="auth-divider"><Txt>{t('or')}</Txt></Box>

          {/* Not `disabled={!canConsent}`: a dead grey control states a verdict
              and withholds the reason. It refuses the click instead and asks,
              the same dialog submit() opens — and the guard runs before consent
              is stashed or Google is contacted, so a refused click leaves
              nothing behind. `google` is remembered so the dialog's confirm
              comes back out through Google rather than the email form. */}
          <GoogleButton
            onError={setError}
            label={t('signupScreen.googleSignup')}
            guard={() => { if (canConsent) return true; askConsent('google'); return false }}
            onBeforeAuth={() => stashPendingConsent(buildConsent({ marketing: agreeMarketing }))}
          />
        </Box>

        <Txt as="p" className="auth-foot">{t('signupScreen.haveAccount')} <Link to={ROUTES.LOGIN} className="auth-foot-cta">{t('login')}</Link></Txt>

        {/* The login screen has had one of these all along. Someone who lands
            straight on /signup — from the landing page's own button, or a
            shared link — had no way to change the language of the screen they
            were being asked to hand over an address on. */}
        <LanguageSwitcher className="auth-langs" />

        {/* The consents themselves, unchanged — the same two boxes, the same
            links out to the documents, opening in their own tab so reading one
            never costs the form. Only where they stand has moved. */}
        <Modal
          open={consentOpen}
          onClose={dismissConsent}
          title={t('signupScreen.consentModalTitle')}
        >
          <Box className="auth-checks auth-checks-modal">
            <Box as="label" className="auth-check">
              <Input type="checkbox" checked={agreePolicies} onChange={(e) => setAgreePolicies(e.target.checked)} />
              <Txt className="auth-check-box" aria-hidden="true"><Check size={15} strokeWidth={3} /></Txt>
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
              <Txt className="auth-check-box" aria-hidden="true"><Check size={15} strokeWidth={3} /></Txt>
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
          </Box>

          {showConsentErr && (
            <Txt as="p" className="auth-error" role="alert">{t('signupScreen.mustAccept')}</Txt>
          )}

          <Box className="m-actions">
            <Btn type="button" className="m-btn-cancel" onClick={dismissConsent}>
              {t('signupScreen.consentModalCancel')}
            </Btn>
            <Btn type="button" className="m-btn-save" onClick={confirmConsent}>
              {t('signupScreen.consentModalConfirm')}
            </Btn>
          </Box>
        </Modal>
      </Box>
    </Box>
  )
}
