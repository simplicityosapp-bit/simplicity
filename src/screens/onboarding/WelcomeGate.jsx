import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useOnboarding } from '../../hooks/useOnboarding'

/* Pre-flow welcome screen — shows once before the 9-step wizard.
   Two paths: (1) start the onboarding (advance to step 1) or
   (2) skip everything and head straight to the home dashboard.
   Either choice flips `onboarding.welcome_seen` so the gate doesn't
   replay on subsequent visits to /onboarding (e.g. if the user comes
   back from the settings → reset action). */
export default function WelcomeGate() {
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
    <div className="ob-screen screen">
      <div className="ob-welcome">
        <img className="ob-welcome-logo" src="/logo-light.png" alt="" aria-hidden="true" />
        <p className="ob-welcome-name">Simplicity</p>
        <p className="ob-welcome-tag">Practice OS</p>

        <button type="button" className="ob-welcome-option primary" onClick={onStart}>
          <span className="ob-welcome-option-title">אונבורדינג</span>
          <span className="ob-welcome-option-sub">היכרות קצרה ומעמיקה והתאמות אישיות</span>
          <ArrowLeft size={16} strokeWidth={1.8} className="ob-welcome-option-arrow" aria-hidden="true" />
        </button>

        <button type="button" className="ob-welcome-option ghost" onClick={onSkip}>
          <span className="ob-welcome-option-title">אני רוצה כבר להכנס</span>
          <span className="ob-welcome-option-sub">אני אסתדר עם ללמוד הכל לבד</span>
          <ArrowLeft size={16} strokeWidth={1.8} className="ob-welcome-option-arrow" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
