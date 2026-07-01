import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useOnboarding } from '../../hooks/useOnboarding'
import { useT } from '../../i18n/useT'
import LanguageSwitcher from '../../i18n/LanguageSwitcher'
import { Box, Txt, Btn } from '../../components/ui'

/* Pre-flow welcome screen — shows once before the 9-step wizard.
   Two paths: (1) start the onboarding (advance to step 1) or
   (2) skip everything and head straight to the home dashboard.
   Either choice flips `onboarding.welcome_seen` so the gate doesn't
   replay on subsequent visits to /onboarding (e.g. if the user comes
   back from the settings → reset action). */
export default function WelcomeGate() {
  const { t } = useT('onboarding')
  const navigate = useNavigate()
  const { update } = useUserPreferences()
  const ob = useOnboarding()

  const onStart = async () => {
    await update({ onboarding: { welcome_seen: true } })
    await ob.markStarted()
    /* The parent OnboardingScreen will re-render and now render the
       regular OnboardingShell at the current step (defaults to 'profile'). */
  }

  const onSkip = async () => {
    await update({ onboarding: { welcome_seen: true } })
    await ob.skipAll()
    navigate(ROUTES.HOME, { replace: true })
  }

  return (
    <Box className="ob-screen screen">
      <Box className="ob-welcome">
        {/* Two img tags + a CSS swap on [data-theme] so the right logo
            ships against the right background tone — dark logo against
            the daytime tree-frame, light logo against the night one. */}
        <img className="ob-welcome-logo ob-welcome-logo-day"   src="/logo-dark.png"  alt="" aria-hidden="true" />
        <img className="ob-welcome-logo ob-welcome-logo-night" src="/logo-light.png" alt="" aria-hidden="true" />
        <Txt as="p" className="ob-welcome-name">Simplicity</Txt>
        <Txt as="p" className="ob-welcome-tag">{t('welcome.tagline')}</Txt>

        <Btn type="button" className="ob-welcome-option primary" onClick={onStart}>
          <Txt className="ob-welcome-option-title">{t('welcome.startTitle')}</Txt>
          <Txt className="ob-welcome-option-sub">{t('welcome.startSub')}</Txt>
          <ArrowLeft size={16} strokeWidth={1.8} className="ob-welcome-option-arrow" aria-hidden="true" />
        </Btn>

        <Btn type="button" className="ob-welcome-option ghost" onClick={onSkip}>
          <Txt className="ob-welcome-option-title">{t('welcome.skipTitle')}</Txt>
          <Txt className="ob-welcome-option-sub">{t('welcome.skipSub')}</Txt>
          <ArrowLeft size={16} strokeWidth={1.8} className="ob-welcome-option-arrow" aria-hidden="true" />
        </Btn>

        <LanguageSwitcher className="ob-welcome-langs" />
      </Box>
    </Box>
  )
}
