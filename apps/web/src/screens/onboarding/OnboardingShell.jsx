import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Sun, Moon, Info } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { useTheme } from '../../hooks/useTheme'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useT } from '../../i18n/useT'
import { showError } from '../../lib/toast'
import OnboardingTree from './OnboardingTree'
import { Box, Txt, Btn } from '../../components/ui'

/* Layout (every step shares this frame; only the body changes):
     1. Progress strip (slim, first thing on screen)
     2. Header row — tree + counter centred, theme toggle in the corner
     3. Body — the step's own fields, inside a <form> so Enter advances
     4. Footer — sticky: back · hint + primary · "אמשיך אחר כך"
   The step publishes its onNext/canAdvance/busy/hint through useStepCTA;
   the shell just renders the buttons.

   There is no help drawer any more. Four short steps that explain
   themselves on the page don't need a second, hidden explanation behind a
   "?" — and a panel nobody opens is a place for copy to go stale. */
export default function OnboardingShell({ ob, cta, children }) {
  const { t } = useT('onboarding')
  const navigate = useNavigate()
  const [skipping, setSkipping] = useState(false)
  const [exiting, setExiting] = useState(false)

  /* The primary CTA was wired straight to cta.onNext, which is async on most
     steps. A rejection therefore became an unhandled promise rejection: the
     user tapped "next"/"סיום", nothing moved, and nothing said why. Most
     visible on the last step, where finishing re-throws on a failed save —
     by design, so a retry is possible — but the throw had nowhere to land. */
  const runNext = async (e) => {
    try {
      await cta?.onNext?.(e)
    } catch {
      showError(t('shell.saveFailed'))
    }
  }

  /* Advance without recording the step. Reset the flag on BOTH paths: on a
     non-last step this only moves forward (the shell stays mounted), so
     without it the guard would block every later skip. */
  const onSkipStep = async () => {
    if (skipping) return
    setSkipping(true)
    try { await ob.skipStep() } finally { setSkipping(false) }
  }

  /* Leave the flow. It used to be a one-way door offered exactly once, on
     the welcome screen: after that the App-level gate sent every route back
     here, and someone who stalled on step 3 had no way out but to press
     "skip" through every remaining step. This releases the gate and lands
     them home — and because it only sets skipped_at, the setup card can
     bring them back to the step they left. */
  const onExit = async () => {
    if (exiting) return
    setExiting(true)
    try {
      await ob.skipAll()
      navigate(ROUTES.HOME, { replace: true })
    } catch {
      setExiting(false)
      showError(t('shell.saveFailed'))
    }
  }

  const isFirst = ob.stepIndex === 0

  /* The primary button is never dead. A step with nothing in it offers to
     move on instead of greying out — the old screen disabled it on arrival
     and left a small "דלג" link as the only way forward, which reads as the
     app being stuck. Filled → it saves; empty or not yet valid → it says so
     and moves on. The hint beside it says what filling it in would get. */
  const canAdvance = !!cta?.canAdvance
  const busy = !!cta?.busy
  const primaryLabel = busy
    ? t('shell.saving')
    : (canAdvance ? (cta?.nextLabel || t('shell.next')) : t('shell.later'))
  const onPrimary = canAdvance ? runNext : onSkipStep

  /* Enter advances, only when the step is actually complete — otherwise the
     key that means "done with this field" would silently skip the step.

     Handled on keydown rather than left to the form's implicit submission,
     which HTML only performs when a form has exactly one field or a default
     button. Both were true here and it still didn't fire in Chrome, so the
     one keystroke everybody presses would have worked on some steps and
     quietly done nothing on others. This is explicit and step-count blind. */
  const submitFromKey = (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    /* A textarea's Enter is a newline, and a focused button has its own
       action — neither should be hijacked into advancing. */
    const tag = e.target?.tagName
    if (tag === 'TEXTAREA' || tag === 'BUTTON') return
    e.preventDefault()
    if (canAdvance && !busy) runNext(e)
  }
  const onSubmit = (e) => {
    e.preventDefault()
    if (canAdvance && !busy) runNext(e)
  }

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

        {/* Top inline-end corner: the theme toggle. Pulled out of flow by
            CSS so the centered tree above the progress strip stays
            optically centered. */}
        <Box className="ob-head-right">
          <Btn
            className="ob-corner-btn"
            onClick={handleToggleTheme}
            aria-label={isDark ? t('shell.dayMode') : t('shell.nightMode')}
            title={isDark ? t('shell.dayMode') : t('shell.nightMode')}
          >
            {isDark
              ? <Sun size={16} strokeWidth={1.5} aria-hidden="true" />
              : <Moon size={16} strokeWidth={1.5} aria-hidden="true" />}
          </Btn>
        </Box>
      </Box>

      {/* A form for the semantics; Enter is handled on keydown (see above)
          rather than by implicit submission. Every Btn defaults to
          type="button" (components/ui/Btn), so no pill can submit it. */}
      <Box as="form" className="ob-body" onSubmit={onSubmit} onKeyDown={submitFromKey}>
        {children}
      </Box>

      <Box as="footer" className="ob-foot">
        <Box className="ob-foot-row">
          {/* "חזרה" first → renders on the inline-start side (right in RTL). */}
          <Box className="ob-foot-back">
            <Btn className="ob-btn ghost" onClick={ob.back} disabled={isFirst}>
              <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" /> {t('shell.back')}
            </Btn>
          </Box>

          <Box className="ob-foot-cta">
            {cta?.hint && (
              <Txt as="p" className="ob-cta-hint">
                <Info size={13} strokeWidth={2} aria-hidden="true" />
                {cta.hint}
              </Txt>
            )}
            <Btn
              className={`ob-btn primary${canAdvance ? '' : ' quiet'}`}
              onClick={onPrimary}
              disabled={busy || skipping || !cta}
            >
              {skipping ? t('shell.saving') : primaryLabel}
            </Btn>
          </Box>
        </Box>

        {/* The way out. Deliberately the quietest thing here — a text link
            under the buttons, not a third control competing with them. */}
        <Btn className="ob-foot-exit" onClick={onExit} disabled={exiting}>
          {exiting ? t('shell.saving') : t('shell.exit')}
        </Btn>
      </Box>
    </Box>
  )
}
