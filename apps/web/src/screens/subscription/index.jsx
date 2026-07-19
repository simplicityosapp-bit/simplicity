import { Check, Gem } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { TIERS, PRICES } from '@simplicity/core'
import { Box, Txt } from '../../components/ui'
import './SubscriptionScreen.css'

/* Benefit keys for the plan (resolved via the `subscription` namespace).
   These are the Basic tier's benefits — the single paid plan on offer now,
   shown under the "Premium" display label (see the note below). The real
   premium tier (community, AI, ₪89) stays held back and isn't surfaced. */
const BASIC_BENEFITS = ['unlimited', 'invoicing', 'pages']

/* ════════════════════════════════════════════════════════════════
   Subscription screen — the user's OWN Simplicity plan.
   ════════════════════════════════════════════════════════════════
   A dedicated nav destination (promoted out of Settings). Everyone is
   currently on the single paid plan (free during the beta), so the
   screen is informational: it shows that plan as the current one plus
   what it includes. No payment/upgrade flow (Stripe deferred).

   Branding: the plan is LABELLED "Premium" (tiers.premium.name) per the
   owner's call, but is priced + provisioned as the Basic tier — price
   (PRICES.basic), benefits (BASIC_BENEFITS) and tagline all come from
   Basic. Only the display name changed.
   ════════════════════════════════════════════════════════════════ */
export default function SubscriptionScreen() {
  const { t } = useT('subscription')

  return (
    <Box className="screen">
      <Box className="screen-top">
        <Box as="header" className="screen-head">
          <Box>
            <Box className="screen-head-meta">
              <Txt as="p" className="lbl">{t('screen.metaA')}</Txt>
              <Txt className="lbl dot">·</Txt>
              <Txt as="p" className="lbl">{t('screen.metaB')}</Txt>
            </Box>
            <Txt as="p" className="lbl-sm">{t('screen.tagline')}</Txt>
          </Box>
          <Txt as="p" className="t-screen">{t('screen.title')}</Txt>
        </Box>
      </Box>

      <Box className="subs-body">
        {/* Current plan — Basic for everyone right now. */}
        <Box className="subs-current">
          <Txt as="p" className="subs-current-label">{t('current.label')}</Txt>
          <Txt as="p" className="subs-current-tier">
            <Gem size={16} strokeWidth={1.7} aria-hidden="true" />
            {t('tiers.premium.name')}
          </Txt>
        </Box>

        {/* The plan itself */}
        <Box className="subs-offer">
          <Txt as="p" className="subs-offer-h">{t('screen.offerHeading')}</Txt>
          <Box className="subs-plan">
            <Box className="subs-plan-head">
              <Txt as="p" className="subs-plan-name">{t('tiers.premium.name')}</Txt>
              <Txt as="p" className="subs-plan-tag">{t('tiers.basic.tagline')}</Txt>
            </Box>
            <Txt as="p" className="subs-plan-price">
              <Txt className="subs-plan-amount">₪{PRICES[TIERS.BASIC]}</Txt>
              <Txt className="subs-plan-per">{t('perMonth')}</Txt>
            </Txt>
            <Box as="ul" className="subs-plan-benefits">
              {BASIC_BENEFITS.map((b) => (
                <Box as="li" key={b}>
                  <Check size={15} strokeWidth={2} aria-hidden="true" />
                  {t(`benefits.${b}`)}
                </Box>
              ))}
            </Box>
            <Txt as="p" className="subs-plan-current">{t('thisIsYourPlan')}</Txt>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
