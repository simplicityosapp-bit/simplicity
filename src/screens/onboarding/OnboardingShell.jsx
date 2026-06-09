import { useState } from 'react'
import { HelpCircle, ChevronRight, ChevronLeft, Sun, Moon } from 'lucide-react'
import { ONBOARDING_STEPS } from '../../lib/preferences'
import { useTheme } from '../../hooks/useTheme'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import OnboardingTree from './OnboardingTree'
import OnboardingHelpPanel from './OnboardingHelpPanel'
import { HELP_BY_STEP } from './helpContent'

/* Layout (all 9 steps share this frame; only the body changes):
     1. Progress strip (slim, first thing on screen)
     2. Header row — two panels:
        - tree + counter combined on the inline-start side (right in RTL)
        - help (?) button on the inline-end side (left)
     3. Body — step-rendered fields
     4. Footer — two clusters:
        - Next + "דלג" (in its own micro-panel) on the inline-end side (left)
        - "חזרה" in a small glass panel on the inline-start side (right)
   The step component publishes its onNext/canAdvance/busy/hint via the
   setCTA prop on the screen; the shell just renders the buttons. */
export default function OnboardingShell({ ob, cta, children }) {
  const [helpOpen, setHelpOpen] = useState(false)
  const [skipping, setSkipping] = useState(false)
  /* The App-level gate (obDone) swaps to Home once skip/complete writes land;
     show a busy state meanwhile so the last-step "סיום" isn't a dead tap. */
  const onSkip = async () => {
    if (skipping) return
    setSkipping(true)
    try { await ob.skipStep() } catch { setSkipping(false) }
  }
  const helpContent = HELP_BY_STEP[ob.step] || null
  const isFirst = ob.stepIndex === 0
  const isLast = ob.stepIndex === ONBOARDING_STEPS.length - 1
  /* Theme toggle — same plumbing as AppShell: flip the local hook
     immediately for instant feedback, then persist to prefs so the
     choice survives reload + sync across devices. */
  const { isDark, toggleTheme } = useTheme()
  const { update: updatePrefs } = useUserPreferences()
  const handleToggleTheme = () => {
    toggleTheme()
    updatePrefs({ design: { theme: isDark ? 'light' : 'dark' } })
  }

  return (
    <div className="ob-frame">
      {/* Progress strip — first thing on screen so the user reads
          "where am I in the flow?" before anything else. */}
      <div className="ob-progress" aria-label={`התקדמות: צעד ${ob.stepIndex + 1} מתוך ${ob.total}`}>
        <div className="ob-progress-track">
          <div className="ob-progress-fill" style={{ width: `${Math.round(ob.progress * 100)}%` }} />
        </div>
      </div>

      <header className="ob-head">
        {/* Tree + counter share one small panel — the counter sits as
            a tiny line above the tree's crown. */}
        <div className="ob-head-left">
          <p className="ob-step-counter mono">{ob.stepIndex + 1} / {ob.total}</p>
          <OnboardingTree stepIndex={ob.stepIndex} />
        </div>

        {/* Top inline-end corner cluster: theme toggle + (optional)
            help button. Pulled out of flow by CSS so the centered
            tree above the progress strip stays optically centered. */}
        <div className="ob-head-right">
          <button
            type="button"
            className="ob-help-btn"
            onClick={handleToggleTheme}
            aria-label={isDark ? 'מצב יום' : 'מצב לילה'}
            title={isDark ? 'מצב יום' : 'מצב לילה'}
          >
            {isDark
              ? <Sun size={16} strokeWidth={1.7} aria-hidden="true" />
              : <Moon size={16} strokeWidth={1.7} aria-hidden="true" />}
          </button>
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
        </div>
      </header>

      <main className="ob-body">{children}</main>

      <footer className="ob-foot">
        {/* "חזרה" first → renders on the inline-start side (right in RTL). */}
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

        {/* CTA cluster (Next + "דלג") second → renders on inline-end (left in RTL).
            The skip link has its own micro-panel now so it's visible against the bg. */}
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
          {!isLast && (
            <button
              type="button"
              className="ob-btn link ob-foot-skip"
              onClick={onSkip}
              disabled={skipping}
            >
              {skipping ? 'מסיים…' : 'דלג'} <ChevronLeft size={13} strokeWidth={1.6} aria-hidden="true" />
            </button>
          )}
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
