import { useCallback, useEffect, useRef, useState } from 'react'
import { useOnboarding } from '../../lib/onboarding'
import OnboardingShell from './OnboardingShell'
import WelcomeGate from './WelcomeGate'
import Step1Profile from './steps/Step1Profile'
import Step2Project from './steps/Step2Project'
import Step3Clients from './steps/Step3Clients'
import Step4Goals from './steps/Step4Goals'
import Step5Finish from './steps/Step5Finish'

/* The onboarding flow. Mirrors apps/web/src/screens/onboarding/index.jsx:
   the welcome gate shows until acknowledged, then the current step drives
   the body, and finishing releases the guard in App.js. */

const STEPS = {
  profile: Step1Profile,
  projects: Step2Project,
  clients: Step3Clients,
  goals: Step4Goals,
  finish: Step5Finish,
}

export default function OnboardingScreen() {
  const ob = useOnboarding()

  /* CTA descriptor lifted to the screen so the shell's footer can render
     the primary button outside the step body. Each step publishes its
     onNext/canAdvance/busy/hint through useStepCTA. */
  const [cta, setCTA] = useState(null)
  const StepComp = STEPS[ob.step] || STEPS.profile

  /* Stamp the start once the user is actually in the flow. A no-op after
     the first time — markStartedPatch returns null, so nothing is written
     and nothing can revert welcome_seen behind it. */
  useEffect(() => {
    if (ob.state.welcome_seen) ob.markStarted()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ob.state.welcome_seen])

  /* Finishing is guarded by a ref rather than state: the last step's CTA
     stays enabled, so a second press before the re-render would otherwise
     complete twice. Released on failure so a retry is possible. */
  const finishing = useRef(false)
  const onDone = useCallback(async () => {
    if (finishing.current) return
    finishing.current = true
    try {
      await ob.complete()
    } catch (e) {
      finishing.current = false
      throw e
    }
  }, [ob])

  if (!ob.state.welcome_seen) {
    return (
      <WelcomeGate
        onStart={async () => {
          await ob.seeWelcome()
          await ob.markStarted()
        }}
        onSkip={async () => {
          await ob.seeWelcome()
          await ob.skipAll()
        }}
      />
    )
  }

  return (
    <OnboardingShell ob={ob} cta={cta}>
      <StepComp key={ob.step} step={ob.step} ob={ob} onDone={onDone} setCTA={setCTA} />
    </OnboardingShell>
  )
}

