import { useState } from 'react'
import { HelpCircle, ChevronRight, ChevronLeft, Sun, Moon } from 'lucide-react'
import { ONBOARDING_STEPS } from '../../lib/preferences'
import { useTheme } from '../../hooks/useTheme'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useT } from '../../i18n/useT'
import OnboardingTree from './OnboardingTree'
import OnboardingHelpPanel from './OnboardingHelpPanel'
import { HELP_BY_STEP } from './helpContent'
import { Box, Txt, Btn } from '../../components/ui'

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
  const { t } = useT('onboarding')
  const [helpOpen, setHelpOpen] = useState(false)
  const [skipping, setSkipping] = useState(false)
  /* The App-level gate (obDone) swaps to Home once skip/complete writes land;
     show a busy state meanwhile so the last-step "סיום" isn't a dead tap. */
  const onSkip = async () => {
    if (skipping) return
    setSkipping(true)
    /* Reset on BOTH success and failure: skipStep on a non-last step only
       advances (the shell stays mounted), so without resetting here the
       button stuck on "מסיים…" forever and the `skipping` guard blocked
       every later skip. On the last step skipStep navigates home and the
       shell unmounts, where this setState is a harmless no-op. */
    try { await ob.skipStep() } finally { setSkipping(false) }
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
    <Box className="ob-frame">
      {/* Progress strip — first thing on screen so the user reads
          "where am I in the flow?" before anything else. */}
      <Box className="ob-progress" aria-label={t('shell.progressAria', { current: ob.stepIndex + 1, total: ob.total })}>
        <Box className="ob-progress-track">
          <Box className="ob-progress-fill" style={{ width: `${Math.round(ob.progress * 100)}%` }} />
        </Box>
      </Box>

      <Box as="header" className="ob-head">
        {/* Tree + counter share one small panel — the counter sits as
            a tiny line above the tree's crown. */}
        <Box className="ob-head-left">
          <Txt as="p" className="ob-step-counter">{t('shell.stepCounter', { current: ob.stepIndex + 1, total: ob.total })}</Txt>
          <OnboardingTree stepIndex={ob.stepIndex} />
        </Box>

        {/* Top inline-end corner cluster: theme toggle + (optional)
            help button. Pulled out of flow by CSS so the centered
            tree above the progress strip stays optically centered. */}
        <Box className="ob-head-right">
          <Btn
            type="button"
            className="ob-help-btn"
            onClick={handleToggleTheme}
            aria-label={isDark ? t('shell.dayMode') : t('shell.nightMode')}
            title={isDark ? t('shell.dayMode') : t('shell.nightMode')}
          >
            {isDark
              ? <Sun size={16} strokeWidth={1.5} aria-hidden="true" />
              : <Moon size={16} strokeWidth={1.5} aria-hidden="true" />}
          </Btn>
          {helpContent && (
            <Btn
              type="button"
              className="ob-help-btn"
              onClick={() => setHelpOpen(true)}
              aria-label={t('shell.helpAria')}
              title={t('shell.helpAria')}
            >
              <HelpCircle size={16} strokeWidth={1.5} aria-hidden="true" />
            </Btn>
          )}
        </Box>
      </Box>

      <Box as="main" className="ob-body">{children}</Box>

      <Box as="footer" className="ob-foot">
        {/* "חזרה" first → renders on the inline-start side (right in RTL). */}
        <Box className="ob-foot-back">
          <Btn
            type="button"
            className="ob-btn ghost"
            onClick={ob.back}
            disabled={isFirst}
          >
            <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" /> {t('shell.back')}
          </Btn>
        </Box>

        {/* CTA cluster (Next + "דלג") second → renders on inline-end (left in RTL).
            The skip link has its own micro-panel now so it's visible against the bg. */}
        <Box className="ob-foot-cta">
          {cta?.hint && <Txt as="p" className="ob-empty-hint">{cta.hint}</Txt>}
          <Btn
            type="button"
            className="ob-btn primary"
            onClick={cta?.onNext}
            disabled={!cta?.canAdvance || cta?.busy || !cta?.onNext}
          >
            {cta?.busy ? t('shell.saving') : (cta?.nextLabel || t('shell.next'))}
          </Btn>
          {!isLast && (
            <Btn
              type="button"
              className="ob-btn link ob-foot-skip"
              onClick={onSkip}
              disabled={skipping}
            >
              {skipping ? t('shell.finishing') : t('shell.skip')} <ChevronLeft size={16} strokeWidth={1.5} aria-hidden="true" />
            </Btn>
          )}
        </Box>
      </Box>

      <OnboardingHelpPanel
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        content={helpContent}
      />
    </Box>
  )
}
