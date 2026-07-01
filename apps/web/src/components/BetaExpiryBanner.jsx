import { useMemo } from 'react'
import { AlertCircle } from 'lucide-react'
import { useSubscription } from '../hooks/useSubscription'
import { useUpgradeNav } from '../hooks/useUpgradeNav'
import { useT } from '../i18n/useT'
import { BILLING_ENABLED } from '@simplicity/core'
import './BetaExpiryBanner.css'
import { Txt, Btn } from './ui'

/* Heads-up banner shown when a user's beta exemption is about to end — so they
   aren't dropped to the free plan (and its limits) by surprise. Tapping routes
   to the subscription/upgrade screen.

   Inert until billing is live: while BILLING_ENABLED is false every user keeps
   full access regardless of the exemption date, so there's nothing to warn
   about and the banner renders nothing. */
const WARN_DAYS = 14

export default function BetaExpiryBanner() {
  const { t, lang } = useT('subscription')
  const { betaExempt, sub } = useSubscription()
  const goUpgrade = useUpgradeNav()
  const exemptUntil = sub?.beta_exempt_until || null
  /* Days-until-expiry — computed inside useMemo (same `new Date()` pattern as
     AttentionWidget) so the render body stays pure. */
  const days = useMemo(
    () => (exemptUntil ? Math.ceil((new Date(exemptUntil).getTime() - new Date().getTime()) / 86400000) : null),
    [exemptUntil],
  )

  if (!BILLING_ENABLED || !betaExempt || !exemptUntil || days == null || days > WARN_DAYS) return null

  const date = new Date(exemptUntil).toLocaleDateString(lang === 'he' ? 'he-IL' : lang)
  return (
    <Btn type="button" className="beta-banner" onClick={goUpgrade}>
      <AlertCircle size={16} strokeWidth={1.8} aria-hidden="true" />
      <Txt className="beta-banner-text">{t('banner.ending', { date })}</Txt>
      <Txt className="beta-banner-cta">{t('banner.cta')}</Txt>
    </Btn>
  )
}
