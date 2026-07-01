import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trans } from 'react-i18next'
import { Mail, MailCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ROUTES } from '../../lib/routes'
import { translateAuthError } from '../../auth/authErrors'
import { useT } from '../../i18n/useT'
import './AuthScreen.css'
import { Box, Txt, Btn, Input } from '../../components/ui'

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
            <Txt as="p" className="auth-title">{t('reset.sentTitle')}</Txt>
            <Txt as="p" className="auth-sub">
              <Trans t={t} i18nKey="reset.sentBody" values={{ email }} components={[<bdi key="e" />]} />
            </Txt>
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
          <Txt as="p" className="auth-title">{t('reset.title')}</Txt>
          <Txt as="p" className="auth-sub">{t('reset.subtitle')}</Txt>

          {error && <Txt as="p" className="auth-error">{error}</Txt>}

          <Box as="label" className="auth-field" htmlFor="reset-email">
            <Txt className="auth-field-icon"><Mail size={16} strokeWidth={1.6} aria-hidden="true" /></Txt>
            <Input
              id="reset-email"
              type="email"
              dir="ltr"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
            />
          </Box>

          <Btn className="auth-btn auth-btn-primary" type="submit" disabled={busy}>
            {busy ? t('reset.sending') : t('reset.sendLink')}
          </Btn>

          <Txt as="p" className="auth-foot"><Link to={ROUTES.LOGIN} className="auth-foot-cta">{t('backToLogin')}</Link></Txt>
        </Box>
      </Box>
    </Box>
  )
}
