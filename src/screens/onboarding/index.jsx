import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../lib/routes'
import { useOnboarding } from '../../hooks/useOnboarding'
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

/* Per-step component map — each renders a focused panel + decides
   when it's "complete enough" to advance. The shell wraps it all
   with the tree + chrome + skip controls. */
const STEPS = {
  profile:         { Component: Step1Profile,        title: 'מי את/ה?' },
  data_import:     { Component: Step2DataImport,     title: 'יש לך דאטה קיימת?' },
  projects:        { Component: Step3Projects,       title: 'פרויקטים' },
  clients:         { Component: Step4Clients,        title: 'לקוחות' },
  daily_questions: { Component: Step5DailyQuestions, title: 'שאלות יומיות' },
  goals:           { Component: Step6Goals,          title: 'יעדים' },
  recurring:       { Component: Step7Recurring,      title: 'כסף מעגלי' },
  preview:         { Component: Step8Preview,        title: 'מה ייצא מזה' },
  finish:          { Component: Step9Finish,         title: 'מוכן/ה לצאת לדרך' },
}

export default function OnboardingScreen() {
  const navigate = useNavigate()
  const ob = useOnboarding()
  const [skipAllOpen, setSkipAllOpen] = useState(false)
  /* CTA descriptor lifted to the screen so the shell footer can
     render the primary Next button outside the per-step body. Each
     step pushes its onNext/canAdvance/busy/hint via setCTA below. */
  const [cta, setCTA] = useState(null)
  const meta = STEPS[ob.step] || STEPS.profile
  const StepComp = meta.Component

  /* Show the welcome chooser on first ever visit. The flag is flipped
     by WelcomeGate (either path), so we never replay it. */
  if (!ob.state.welcome_seen) {
    return <WelcomeGate />
  }

  const onDone = async () => {
    await ob.complete()
    navigate(ROUTES.HOME, { replace: true })
  }
  const onSkipAll = async () => {
    setSkipAllOpen(false)
    await ob.skipAll()
    navigate(ROUTES.HOME, { replace: true })
  }

  return (
    <div className="ob-screen screen">
      <OnboardingShell
        title={meta.title}
        ob={ob}
        cta={cta}
        onAskSkipAll={() => setSkipAllOpen(true)}
      >
        <StepComp ob={ob} onDone={onDone} setCTA={setCTA} />
      </OnboardingShell>

      {skipAllOpen && (
        <div className="ob-confirm-back" onClick={() => setSkipAllOpen(false)} aria-hidden="true">
          <div className="ob-confirm" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <p className="ob-confirm-title">לדלג על כל ההכרות?</p>
            <p className="ob-confirm-body">
              תוכל/י להתחיל מאפס בכל מסך. אפשר תמיד לחזור לכאן מההגדרות.
            </p>
            <div className="ob-confirm-actions">
              <button type="button" className="ob-btn ghost" onClick={() => setSkipAllOpen(false)}>חזרה</button>
              <button type="button" className="ob-btn danger" onClick={onSkipAll}>לדלג</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
