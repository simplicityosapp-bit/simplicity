import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../lib/routes'
import { useOnboarding } from '../../hooks/useOnboarding'
import OnboardingShell from './OnboardingShell'
import WelcomeGate from './WelcomeGate'
import Step1Profile from './steps/Step1Profile'
import Step2Project from './steps/Step2Project'
import Step3Clients from './steps/Step3Clients'
import Step4Goals   from './steps/Step4Goals'
import Step5Finish  from './steps/Step5Finish'
import './OnboardingScreen.css'
import { Box } from '../../components/ui'

/* Step key → component map. Titles dropped from the shell per design
   pass 2 (the body's own intros do the labelling).

   The flow was nine steps and ran the file import inside itself, which
   meant two passes through a spreadsheet-shaped review wizard before the
   user had seen the app at all. Importing now lives in Settings, reached
   from the home setup card, and this is four steps and a close. */
const STEPS = {
  profile:  Step1Profile,
  projects: Step2Project,
  clients:  Step3Clients,
  goals:    Step4Goals,
  finish:   Step5Finish,
}

export default function OnboardingScreen() {
  const navigate = useNavigate()
  const ob = useOnboarding()
  /* CTA descriptor lifted to the screen so the shell footer can render the
     primary Next button outside the per-step body. Each step publishes its
     onNext/canAdvance/busy/hint through useStepCTA. */
  const [cta, setCTA] = useState(null)
  const StepComp = STEPS[ob.step] || STEPS.profile

  /* Latest inputs to onDone, kept in a ref so the callback below stays
     referentially stable across renders. */
  const onDoneInputs = useRef({ ob, navigate })
  useEffect(() => { onDoneInputs.current = { ob, navigate } })

  /* Finish: flip completed_at and land home. A ref latch guards the
     last step (whose CTA stays enabled) from a double-tap firing
     complete() + navigate twice. */
  const finishingRef = useRef(false)
  const onDone = useCallback(async () => {
    if (finishingRef.current) return
    finishingRef.current = true
    const cur = onDoneInputs.current
    try {
      await cur.ob.complete()
      cur.navigate(ROUTES.HOME, { replace: true })
    } catch (e) {
      finishingRef.current = false /* completing failed — allow a retry */
      throw e
    }
  }, [])

  /* Show the welcome chooser on first ever visit. The flag is flipped by
     WelcomeGate (either path), so we never replay it. MUST stay below all
     hooks above — an early return before them changes the hook count
     between renders (React #310) and blanks the screen once welcome_seen
     flips to true. */
  if (!ob.state.welcome_seen) {
    return <WelcomeGate />
  }

  return (
    <Box className="ob-screen screen">
      <OnboardingShell ob={ob} cta={cta}>
        <StepComp ob={ob} onDone={onDone} setCTA={setCTA} />
      </OnboardingShell>
    </Box>
  )
}
