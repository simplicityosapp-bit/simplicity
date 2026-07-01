import { useState } from 'react'
import { Check, Gem } from 'lucide-react'
import Modal from '../../modals/Modal'
import { useT } from '../../i18n/useT'
import { useSubscription } from '../../hooks/useSubscription'
import { TIERS, PRICES } from '@simplicity/core'
import './SubscriptionBody.css'
import { Box, Txt, Btn } from '../../components/ui'

/* Benefit keys per tier (resolved via the `subscription` namespace). The
   list is intentionally short + scannable; the full model lives in the plan. */
const TIER_BENEFITS = {
  [TIERS.FREE]:    ['tasksRemindersQuestions', 'clientsFree', 'goalsFree', 'projectsFree', 'pagesFree', 'googleCalendar'],
  [TIERS.BASIC]:   ['unlimited', 'invoicing', 'clearing', 'pages'],
  [TIERS.PREMIUM]: ['unlimited', 'pages', 'invoicing', 'clearing', 'ai', 'community'],
}
const TIER_ORDER = [TIERS.FREE, TIERS.BASIC, TIERS.PREMIUM]
const TIER_RANK = { [TIERS.FREE]: 0, [TIERS.BASIC]: 1, [TIERS.PREMIUM]: 2 }

/* Settings → מנוי. Shows the user's current plan (incl. an active beta
   exemption) + the three tiers with their benefits. While billing isn't
   enforced (BILLING_ENABLED=false) this is purely informational: the upgrade
   CTA opens a "coming soon" stub — there is no payment flow yet. */
export default function SubscriptionBody() {
  const { t, lang } = useT('subscription')
  const { tier, sub, betaExempt, loading } = useSubscription()
  const [showUpgrade, setShowUpgrade] = useState(false)

  if (loading) return <Txt as="p" className="set-soon" aria-busy="true">…</Txt>

  const fmtDate = (iso) => new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : lang)
  const betaDate = betaExempt && sub?.beta_exempt_until ? fmtDate(sub.beta_exempt_until) : null
  /* Locked-in terms: the date the user took their current paid plan + the price
     they locked. Stays even if published prices change (price grandfathering). */
  const subSince = sub?.subscribed_at ? fmtDate(sub.subscribed_at) : null

  return (
    <Box className="sub-body">
      <Box className="sub-current">
        <Txt className="sub-current-label">{t('current.label')}</Txt>
        <Txt className="sub-current-tier">
          <Gem size={14} strokeWidth={1.7} aria-hidden="true" />
          {t(`tiers.${tier}.name`)}
        </Txt>
        {betaDate && <Txt className="sub-beta">{t('current.betaUntil', { date: betaDate })}</Txt>}
        {subSince && sub?.locked_price != null && (
          <Txt className="sub-locked">{t('current.lockedTerms', { date: subSince, price: sub.locked_price })}</Txt>
        )}
      </Box>

      <Box className="sub-cards">
        {TIER_ORDER.map((tk) => {
          const current = tk === tier
          const isUpgrade = TIER_RANK[tk] > TIER_RANK[tier]
          const price = PRICES[tk]
          return (
            <Box key={tk} className={`sub-card${current ? ' current' : ''}`}>
              <Box className="sub-card-head">
                <Txt as="p" className="sub-card-name">{t(`tiers.${tk}.name`)}</Txt>
                <Txt as="p" className="sub-card-tag">{t(`tiers.${tk}.tagline`)}</Txt>
              </Box>
              <Txt as="p" className="sub-card-price">
                <Txt className="sub-card-amount">₪{price}</Txt>
                <Txt className="sub-card-per">{t('perMonth')}</Txt>
              </Txt>
              <Box as="ul" className="sub-card-benefits">
                {TIER_BENEFITS[tk].map((b) => (
                  <Box as="li" key={b}>
                    <Check size={14} strokeWidth={2} aria-hidden="true" />
                    {t(`benefits.${b}`)}
                  </Box>
                ))}
              </Box>
              {current ? (
                <Txt as="p" className="sub-card-current">{t('thisIsYourPlan')}</Txt>
              ) : isUpgrade ? (
                <Btn type="button" className="sub-card-cta" onClick={() => setShowUpgrade(true)}>
                  {t('cta.choose')}
                </Btn>
              ) : null}
            </Box>
          )
        })}
      </Box>

      <Modal open={showUpgrade} onClose={() => setShowUpgrade(false)} title={t('upgradeModal.title')}>
        <Txt as="p" className="sub-upgrade-body">{t('upgradeModal.body')}</Txt>
        <Box className="sub-upgrade-actions">
          <Btn type="button" className="m-btn-cancel" onClick={() => setShowUpgrade(false)}>
            {t('upgradeModal.close')}
          </Btn>
        </Box>
      </Modal>
    </Box>
  )
}
