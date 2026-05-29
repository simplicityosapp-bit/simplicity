import { useState } from 'react'
import { HelpCircle, X, ChevronRight, ChevronLeft } from 'lucide-react'
import { ONBOARDING_STEPS } from '../../lib/preferences'
import OnboardingTree from './OnboardingTree'
import OnboardingHelpPanel from './OnboardingHelpPanel'
import { HELP_BY_STEP } from './helpContent'

/* Card frame for every onboarding step. Owns:
   - tree visualization (top-left on desktop, top on mobile)
   - step counter + title
   - help (?) button → slide-up panel with per-step explanation
   - skip-all link (top-right, low-emphasis)
   - footer split: a small "חזרה" panel on one side, the Next CTA
     stacked over a short "דלג" link on the other. The step component
     publishes its onNext/canAdvance/busy/hint via setCTA — that's how
     the shell knows when it's safe to advance without owning the
     step's form state. */
export default function OnboardingShell({ title, ob, cta, children, onAskSkipAll }) {
  const [helpOpen, setHelpOpen] = useState(false)
  const helpContent = HELP_BY_STEP[ob.step] || null
  const isFirst = ob.stepIndex === 0
  const isLast = ob.stepIndex === ONBOARDING_STEPS.length - 1

  return (
    <div className="ob-frame">
      <header className="ob-head">
        <div className="ob-head-left">
          <OnboardingTree completedCount={ob.completedSteps.length} total={ob.total} />
        </div>
        <div className="ob-head-mid">
          <p className="ob-step-counter mono">
            {ob.stepIndex + 1} / {ob.total}
          </p>
          <p className="ob-step-title">{title}</p>
        </div>
        <div className="ob-head-right">
          {helpContent && (
            <button
              type="button"
              className="ob-help-btn"
              onClick={() => setHelpOpen(true)}
              aria-label="הסבר על המסך הזה"
              title="הסבר על המסך הזה"
            >
              <HelpCircle size={16} strokeWidth={1.7} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="ob-skip-all"
            onClick={onAskSkipAll}
            aria-label="דילוג על כל ההכרות"
          >
            דילוג <X size={12} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="ob-progress" aria-label={`התקדמות: צעד ${ob.stepIndex + 1} מתוך ${ob.total}`}>
        <div className="ob-progress-track">
          <div className="ob-progress-fill" style={{ width: `${Math.round(ob.progress * 100)}%` }} />
        </div>
      </div>

      <main className="ob-body">{children}</main>

      <footer className="ob-foot">
        {/* CTA cluster: Next on top, "דלג" link below. No glass — the
            primary button + short skip stand on their own. */}
        <div className="ob-foot-cta">
          {cta?.hint && <p className="ob-empty-hint">{cta.hint}</p>}
          <button
            type="button"
            className="ob-btn primary"
            onClick={cta?.onNext}
            disabled={!cta?.canAdvance || cta?.busy || !cta?.onNext}
          >
            {cta?.busy ? 'שומר…' : (cta?.nextLabel || 'הלאה')}
          </button>
          <button
            type="button"
            className="ob-btn link"
            onClick={ob.skipStep}
          >
            {isLast ? 'סיום בלי למלא' : 'דלג'} <ChevronLeft size={13} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </div>

        {/* Back in its own tiny glass panel on the opposite side. */}
        <div className="ob-foot-back">
          <button
            type="button"
            className="ob-btn ghost"
            onClick={ob.back}
            disabled={isFirst}
          >
            <ChevronRight size={15} strokeWidth={1.6} aria-hidden="true" /> חזרה
          </button>
        </div>
      </footer>

      <OnboardingHelpPanel
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        content={helpContent}
      />
    </div>
  )
}
