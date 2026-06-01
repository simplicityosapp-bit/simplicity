import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../lib/routes'
import { useOnboarding } from '../../hooks/useOnboarding'
import { finalizeOnboardingImport } from '../../lib/onboardingImport'
import { flattenAllSources } from '../../lib/multiImport'
import { projectSheet } from '../../lib/sheetMapper'
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
  onDoneInputs.current = { ob, navigate }

  /* Finish: complete() clears the raw CSV from prefs (personal client
     data we only kept for the review) in the same write, then land home. */
  const finishAndGoHome = useCallback(async () => {
    const cur = onDoneInputs.current
    await cur.ob.complete()
    cur.navigate(ROUTES.HOME, { replace: true })
  }, [])

  /* Build the merged review object from parsed_data (sheets → entities):
     flat entity sheets project their rows; matrix sheets flatten to
     transactions (with project/client links per labelKind). Returns the
     merged review object, or null when nothing is reviewable. Shared by
     the Step 9 finish flow AND the Step 2 "review now" button. */
  const buildReview = (pd) => {
    let review = pd
    if (pd?.sheets?.length) {
      const live = pd.sheets.filter((s) => !s.removed)
      const acc = { clients: [], projects: [], leads: [], transactions: [] }
      live.forEach((sheet) => {
        if (sheet.type === 'matrix') {
          const merged = flattenAllSources([{ id: sheet.id, config: sheet.pivot, transactions: sheet.pivotTransactions, fileName: sheet.fileName }])
          acc.transactions.push(...merged.transactions)
          acc.projects.push(...merged.projects)
          acc.clients.push(...merged.clients)
        } else {
          const p = projectSheet(sheet)
          acc.clients.push(...p.clients)
          acc.projects.push(...p.projects)
          acc.leads.push(...p.leads)
          acc.transactions.push(...p.transactions)
        }
      })
      /* MERGE by name (not just dedup): the same client/project often
         appears across sheets (Notion: clients + meetings + payments),
         each carrying different fields. We keep one record per name and
         fill any empty field from later occurrences, so no data is lost. */
      const mergeByName = (arr) => {
        const byKey = new Map()
        arr.forEach((x) => {
          const k = (x.name || '').trim().toLowerCase()
          if (!k) return
          if (!byKey.has(k)) { byKey.set(k, { ...x }); return }
          const cur = byKey.get(k)
          Object.entries(x).forEach(([field, val]) => {
            const empty = cur[field] == null || cur[field] === '' || cur[field] === 0
            const incoming = val != null && val !== '' && val !== 0
            if (empty && incoming) cur[field] = val
          })
        })
        return Array.from(byKey.values())
      }
      review = { ...pd, ...acc, projects: mergeByName(acc.projects), clients: mergeByName(acc.clients), leads: mergeByName(acc.leads) }
    }
    const reviewable =
      pd?.kind === 'csv' &&
      ((review.clients?.length || 0) + (review.projects?.length || 0)
        + (review.leads?.length || 0) + (review.transactions?.length || 0)) > 0
    return reviewable ? review : null
  }

  /* Step 9 "finish": open the FINAL review (the only create point). It
     leans on the step-2 approval when present (parsed_data.reviewed), so
     the user sees exactly what they approved — still fully editable here.
     Falls back to a fresh build (e.g. user never opened step 2's review). */
  const onDone = useCallback(async () => {
    const pd = onDoneInputs.current.ob.state.parsed_data
    const approved = pd?.reviewed
    const r = approved
      ? { kind: 'csv', clients: approved.clients || [], projects: approved.projects || [], leads: approved.leads || [], transactions: approved.transactions || [] }
      : buildReview(pd)
    const hasAny = r && ((r.clients?.length || 0) + (r.projects?.length || 0) + (r.leads?.length || 0) + (r.transactions?.length || 0)) > 0
    if (hasAny) { setReviewMode('finish'); setReview(r); return }
    await finishAndGoHome()
  }, [finishAndGoHome])

  /* Step 2 "approve now": open the same wizard from the data-import step.
     Returns true if it opened so the step knows not to advance itself. */
  const onReviewFromStep = useCallback(() => {
    const r = buildReview(onDoneInputs.current.ob.state.parsed_data)
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
      await onDoneInputs.current.ob.setParsedData({ ...pd, reviewed: payload })
      return undefined /* clean → wizard advances without a result screen */
    }
    try {
      return await finalizeOnboardingImport(payload)
    } catch (e) {
      return { fatal: true, error: e?.message || 'שגיאה לא צפויה' }
    }
  }, [reviewMode])

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
    <div className="ob-screen screen">
      <OnboardingShell ob={ob} cta={cta}>
        <StepComp ob={ob} onDone={onDone} setCTA={setCTA} onReviewFromStep={onReviewFromStep} />
      </OnboardingShell>
      {review && (
        <OnboardingReviewWizard
          parsed={review}
          mode={reviewMode === 'step2' ? 'approve' : 'create'}
          onConfirm={onReviewConfirm}
          onComplete={onReviewComplete}
          onCancel={() => setReview(null)}
        />
      )}
    </div>
  )
}
