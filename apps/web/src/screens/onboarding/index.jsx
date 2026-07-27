import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../lib/routes'
import { useOnboarding } from '../../hooks/useOnboarding'
import { finalizeOnboardingImport } from '../../lib/onboardingImport'
import { buildReviewFromSheets, sheetsFingerprint } from '../../lib/importFlow'
import { useT } from '../../i18n/useT'
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
import { Box } from '../../components/ui'

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

/* The step-2 approval, but only while it still describes the current data.
   The user's edits and exclusions there are real work, so coming back to
   step 2 must return them exactly as they were — unless a table's type or
   column mapping changed in between, in which case the approved rows no
   longer match what the file yields and rebuilding is the honest answer. */
function usableApproval(pd) {
  const approved = pd?.reviewed
  if (!approved) return null
  return approved.fingerprint === sheetsFingerprint(pd) ? approved : null
}

/* Approved buckets → the shape the review wizard takes. Sessions are
   carried through like every other bucket; leaving them out here used to
   drop a whole ledger of past meetings between the approval and the
   create. */
const reviewFromApproval = (approved) => ({
  kind: 'csv',
  clients: approved.clients || [],
  projects: approved.projects || [],
  leads: approved.leads || [],
  transactions: approved.transactions || [],
  sessions: approved.sessions || [],
})

export default function OnboardingScreen() {
  const { t } = useT('onboarding')
  const navigate = useNavigate()
  const ob = useOnboarding()
  /* CTA descriptor lifted to the screen so the shell footer can
     render the primary Next button outside the per-step body. Each
     step pushes its onNext/canAdvance/busy/hint via setCTA below. */
  const [cta, setCTA] = useState(null)
  /* When non-null, the review wizard is open with this snapshot.
     `reviewMode` says which step opened it:
       'step2'  — data-import step: the user APPROVES (reviews/edits/excludes);
                  we only RECORD the approval, nothing is written.
       'finish' — step 9: the single place data is actually CREATED, leaning
                  on the step-2 approval. Excluding here still wins (hero). */
  const [review, setReview] = useState(null)
  const [reviewMode, setReviewMode] = useState('finish')
  const StepComp = STEPS[ob.step] || STEPS.profile

  /* Latest mutable snapshot of inputs to onDone — kept in refs so the
     callback below stays referentially STABLE across renders. Without
     this, every parent re-render produced a new onDone, which Step 9's
     useEffect treated as a dep change, looping forever. The finalize
     import itself reads existing clients/projects directly from the
     DB so we don't have to plumb them through React state. */
  const onDoneInputs = useRef({ ob, navigate })
  useEffect(() => { onDoneInputs.current = { ob, navigate } }) // keep latest inputs current without destabilizing the memoized onDone

  /* Finish: complete() clears the raw CSV from prefs (personal client
     data we only kept for the review) in the same write, then land home.
     A ref latch guards the no-import-data path (Step 9's CTA stays enabled),
     where a double-tap would otherwise fire complete()+navigate twice. */
  const finishingRef = useRef(false)
  const finishAndGoHome = useCallback(async () => {
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

  /* Merged review object from parsed_data (sheets → entities) is built by
     the shared lib/importFlow.buildReviewFromSheets, so this screen and the
     in-app Settings import project + merge identically. */

  /* Step 9 "finish": open the FINAL review (the only create point). It
     leans on the step-2 approval when present (parsed_data.reviewed), so
     the user sees exactly what they approved — still fully editable here.
     Falls back to a fresh build (e.g. user never opened step 2's review). */
  const onDone = useCallback(async () => {
    const pd = onDoneInputs.current.ob.state.parsed_data
    const approved = usableApproval(pd)
    const r = approved ? reviewFromApproval(approved) : buildReviewFromSheets(pd)
    const hasAny = r && ((r.clients?.length || 0) + (r.projects?.length || 0) + (r.leads?.length || 0) + (r.transactions?.length || 0) + (r.sessions?.length || 0)) > 0
    if (hasAny) { setReviewMode('finish'); setReview(r); return }
    await finishAndGoHome()
  }, [finishAndGoHome])

  /* Step 2 "approve now": open the same wizard from the data-import step.
     Returns true if it opened so the step knows not to advance itself. */
  const onReviewFromStep = useCallback(() => {
    const pd = onDoneInputs.current.ob.state.parsed_data
    const approved = usableApproval(pd)
    /* Re-open on the user's own selection when they've already been through
       here, so a trip back through step 2 doesn't quietly re-include every
       row they took out. */
    const r = approved ? reviewFromApproval(approved) : buildReviewFromSheets(pd)
    if (r) { setReviewMode('step2'); setReview(r); return true }
    return false
  }, [])

  /* Confirm handler — behaviour depends on which step opened the wizard:
       step2  → RECORD the approved selection (no DB write); step 9 uses it.
       finish → actually create the data, returning the summary so the
                wizard can surface partial failures. */
  const onReviewConfirm = useCallback(async (payload) => {
    if (reviewMode === 'step2') {
      const pd = onDoneInputs.current.ob.state.parsed_data || {}
      /* Stamp what the sheets looked like when this was approved, so a later
         visit can tell "same data, restore their choices" from "they remapped
         a column, these rows are stale". */
      await onDoneInputs.current.ob.setParsedData({
        ...pd,
        reviewed: { ...payload, fingerprint: sheetsFingerprint(pd) },
      })
      return undefined /* clean → wizard advances without a result screen */
    }
    try {
      return await finalizeOnboardingImport(payload)
    } catch (e) {
      return { fatal: true, error: e?.message || t('review.error.unexpected') }
    }
  }, [reviewMode, t])

  const onReviewComplete = useCallback(async () => {
    setReview(null)
    if (reviewMode === 'step2') { await onDoneInputs.current.ob.advance(); return }
    await finishAndGoHome()
  }, [reviewMode, finishAndGoHome])

  /* Show the welcome chooser on first ever visit. The flag is flipped
     by WelcomeGate (either path), so we never replay it. MUST stay below
     all hooks above — an early return before them changes the hook count
     between renders (React #310) and blanks the screen once welcome_seen
     flips to true. */
  if (!ob.state.welcome_seen) {
    return <WelcomeGate />
  }

  return (
    <Box className="ob-screen screen">
      <OnboardingShell ob={ob} cta={cta}>
        <StepComp ob={ob} onDone={onDone} setCTA={setCTA} onReviewFromStep={onReviewFromStep} />
      </OnboardingShell>
      {review && (
        <OnboardingReviewWizard
          parsed={review}
          mode={reviewMode === 'step2' ? 'approve' : 'create'}
          allowSkipImport={reviewMode === 'finish'}
          onConfirm={onReviewConfirm}
          onComplete={onReviewComplete}
          onCancel={() => setReview(null)}
        />
      )}
    </Box>
  )
}
