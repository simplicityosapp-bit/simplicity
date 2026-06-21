import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Cookie } from 'lucide-react'

import { ROUTES } from '../lib/routes'
import { useT } from '../i18n/useT'
import { useAuth } from '../auth/AuthContext'
import { hasCookieChoice, setCookieConsent } from '../lib/cookieConsent'
import './CookieBanner.css'

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
    <div className="cookie-banner" role="region" aria-label={t('region')}>
      <div className="cookie-banner-card">
        <Cookie className="cookie-banner-icon" size={22} strokeWidth={1.75} aria-hidden="true" />
        <div className="cookie-banner-text">
          <p className="cookie-banner-title">{t('title')}</p>
          <p className="cookie-banner-body">
            {t('body')}{' '}
            <Link to={ROUTES.LEGAL} className="cookie-banner-link">{t('policy')}</Link>
          </p>
        </div>
        <div className="cookie-banner-actions">
          <button type="button" className="cookie-banner-btn cookie-banner-btn--reject" onClick={() => choose(false)}>
            {t('reject')}
          </button>
          <button type="button" className="cookie-banner-btn cookie-banner-btn--accept" onClick={() => choose(true)}>
            {t('accept')}
          </button>
        </div>
      </div>
    </div>
  )
}
