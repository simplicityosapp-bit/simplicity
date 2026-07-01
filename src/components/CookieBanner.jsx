import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Cookie } from 'lucide-react'

import { ROUTES } from '../lib/routes'
import { useT } from '../i18n/useT'
import { useAuth } from '../auth/AuthContext'
import { hasCookieChoice, setCookieConsent } from '../lib/cookieConsent'
import './CookieBanner.css'
import { Box, Txt, Btn } from './ui'

/* ════════════════════════════════════════════════════════════════
   COOKIE BANNER — public-pages cookie notice with accept / reject.
   ════════════════════════════════════════════════════════════════
   Shows only to logged-out visitors (the public surface: landing, login,
   signup, reset, legal) and only until a choice is made — read
   synchronously from localStorage, so it never flashes for a returning
   visitor. The choice is stored locally (lib/cookieConsent); for a visitor
   who later signs in it is mirrored into the durable user_consent log by
   ConsentSync. Accept and reject are equally weighted (no dark pattern).

   Only essential cookies fire today; analytics + advertising cookies are
   planned (incl. retargeting landing-page visitors). Until then reject
   disables nothing yet — the choice is recorded ahead of those scripts,
   which MUST gate themselves on cookiesAccepted() (opt-in: off until
   accept) before setting any non-essential cookie.
   ════════════════════════════════════════════════════════════════ */
export default function CookieBanner() {
  const { t } = useT('cookies')
  const { session, loading } = useAuth()
  const [choiceMade, setChoiceMade] = useState(() => hasCookieChoice())

  /* Logged-out + undecided only. While auth is resolving we render nothing
     so the banner can't flash before a session is known. */
  if (loading || session || choiceMade) return null

  const choose = (accepted) => {
    setCookieConsent(accepted)
    setChoiceMade(true)
  }

  return (
    <Box className="cookie-banner" role="region" aria-label={t('region')}>
      <Box className="cookie-banner-card">
        <Cookie className="cookie-banner-icon" size={22} strokeWidth={1.75} aria-hidden="true" />
        <Box className="cookie-banner-text">
          <Txt as="p" className="cookie-banner-title">{t('title')}</Txt>
          <Txt as="p" className="cookie-banner-body">
            {t('body')}{' '}
            <Link to={ROUTES.LEGAL} className="cookie-banner-link">{t('policy')}</Link>
          </Txt>
        </Box>
        <Box className="cookie-banner-actions">
          <Btn type="button" className="cookie-banner-btn cookie-banner-btn--reject" onClick={() => choose(false)}>
            {t('reject')}
          </Btn>
          <Btn type="button" className="cookie-banner-btn cookie-banner-btn--accept" onClick={() => choose(true)}>
            {t('accept')}
          </Btn>
        </Box>
      </Box>
    </Box>
  )
}
