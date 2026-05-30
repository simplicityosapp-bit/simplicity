import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../lib/routes'
import { useOnboarding } from '../../hooks/useOnboarding'
import { finalizeOnboardingImport } from '../../lib/onboardingImport'
import OnboardingShell from './OnboardingShell'
import WelcomeGate from './WelcomeGate'
import Step1Profile         from './steps/Step1Profile'
import Step2DataImport      from './steps/Step2DataImport'
import Step3Projects        from './steps/Step3Projects'
import Step4Clients         from './steps/Step4Clients'
import Step5DailyQuestions  from './steps/Step5DailyQuestions'
import Step6Goals           from './steps/Step6Goals'
import Step7Recurring       from './steps/Step7Recurring'
import Step8Preview         from './steps/Step8Preview'
import Step9Finish          from './steps/Step9Finish'
import './OnboardingScreen.css'

/* Step key → component map. Titles dropped from the shell per design
   pass 2 (the body's own intros do the labelling). */
const STEPS = {
  profile:         Step1Profile,
  data_import:     Step2DataImport,
  projects:        Step3Projects,
  clients:         Step4Clients,
  daily_questions: Step5DailyQuestions,
  goals:           Step6Goals,
  recurring:       Step7Recurring,
  preview:         Step8Preview,
  finish:          Step9Finish,
}

export default function OnboardingScreen() {
  const navigate = useNavigate()
  const ob = useOnboarding()
  /* CTA descriptor lifted to the screen so the shell footer can
     render the primary Next button outside the per-step body. Each
     step pushes its onNext/canAdvance/busy/hint via setCTA below. */
  const [cta, setCTA] = useState(null)
  const StepComp = STEPS[ob.step] || STEPS.profile

  /* Show the welcome chooser on first ever visit. The flag is flipped
     by WelcomeGate (either path), so we never replay it. */
  if (!ob.state.welcome_seen) {
    return <WelcomeGate />
  }

  /* Latest mutable snapshot of inputs to onDone — kept in refs so the
     callback below stays referentially STABLE across renders. Without
     this, every parent re-render produced a new onDone, which Step 9's
     useEffect treated as a dep change, looping forever. The finalize
     import itself reads existing clients/projects directly from the
     DB so we don't have to plumb them through React state. */
  const onDoneInputs = useRef({ ob, navigate })
  onDoneInputs.current = { ob, navigate }

  const onDone = useCallback(async () => {
    const cur = onDoneInputs.current
    if (cur.ob.state.parsed_data?.kind === 'csv') {
      try {
        await finalizeOnboardingImport({ parsedData: cur.ob.state.parsed_data })
      } catch {
        /* non-fatal — we still want the user on /home */
      }
    }
    await cur.ob.complete()
    cur.navigate(ROUTES.HOME, { replace: true })
  }, [])

  return (
    <div className="ob-screen screen">
      <OnboardingShell ob={ob} cta={cta}>
        <StepComp ob={ob} onDone={onDone} setCTA={setCTA} />
      </OnboardingShell>
    </div>
  )
}
