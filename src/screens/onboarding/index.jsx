import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../lib/routes'
import { useOnboarding } from '../../hooks/useOnboarding'
import { finalizeOnboardingImport } from '../../lib/onboardingImport'
import OnboardingShell from './OnboardingShell'
import OnboardingReviewWizard from './OnboardingReviewWizard'
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
  /* When non-null, the pre-create review wizard is open over Step 9,
     carrying the parsed_data snapshot to review. */
  const [review, setReview] = useState(null)
  const StepComp = STEPS[ob.step] || STEPS.profile

  /* Latest mutable snapshot of inputs to onDone — kept in refs so the
     callback below stays referentially STABLE across renders. Without
     this, every parent re-render produced a new onDone, which Step 9's
     useEffect treated as a dep change, looping forever. The finalize
     import itself reads existing clients/projects directly from the
     DB so we don't have to plumb them through React state. */
  const onDoneInputs = useRef({ ob, navigate })
  onDoneInputs.current = { ob, navigate }

  /* Finish: complete() clears the raw CSV from prefs (personal client
     data we only kept for the review) in the same write, then land home. */
  const finishAndGoHome = useCallback(async () => {
    const cur = onDoneInputs.current
    await cur.ob.complete()
    cur.navigate(ROUTES.HOME, { replace: true })
  }, [])

  /* Step 9 "finish": if the user imported a CSV with reviewable rows,
     open the review wizard instead of writing straight to the DB. Path
     B / empty / Excel-placeholder users complete immediately. */
  const onDone = useCallback(async () => {
    const pd = onDoneInputs.current.ob.state.parsed_data
    const reviewable =
      pd?.kind === 'csv' &&
      ((pd.clients?.length || 0) + (pd.projects?.length || 0) + (pd.transactions?.length || 0)) > 0
    if (reviewable) { setReview(pd); return }
    await finishAndGoHome()
  }, [finishAndGoHome])

  /* Run the import and hand the summary back to the wizard so it can
     surface partial failures instead of swallowing them. Does NOT
     navigate — the wizard calls onReviewComplete once the user is done. */
  const onReviewConfirm = useCallback(async (payload) => {
    try {
      return await finalizeOnboardingImport(payload)
    } catch (e) {
      return { fatal: true, error: e?.message || 'שגיאה לא צפויה' }
    }
  }, [])

  const onReviewComplete = useCallback(async () => {
    setReview(null)
    await finishAndGoHome()
  }, [finishAndGoHome])

  /* Show the welcome chooser on first ever visit. The flag is flipped
     by WelcomeGate (either path), so we never replay it. MUST stay below
     all hooks above — an early return before them changes the hook count
     between renders (React #310) and blanks the screen once welcome_seen
     flips to true. */
  if (!ob.state.welcome_seen) {
    return <WelcomeGate />
  }

  return (
    <div className="ob-screen screen">
      <OnboardingShell ob={ob} cta={cta}>
        <StepComp ob={ob} onDone={onDone} setCTA={setCTA} />
      </OnboardingShell>
      {review && (
        <OnboardingReviewWizard
          parsed={review}
          onConfirm={onReviewConfirm}
          onComplete={onReviewComplete}
          onCancel={() => setReview(null)}
        />
      )}
    </div>
  )
}
