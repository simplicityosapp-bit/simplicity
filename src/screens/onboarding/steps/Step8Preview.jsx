import { useEffect } from 'react'
import { Moon } from 'lucide-react'
import { useT } from '../../../i18n/useT'
import { Box, Txt } from '../../../components/ui'

/* Step 8 — a read-only "מבט על" glimpse, faithful in FORMAT to the home
   MoonWidget (pace % primary + "% מהיעד" secondary, stacked inside the ring).
   The numbers are a fixed, illustrative example — during onboarding there's
   almost no data yet, so a real score wouldn't be meaningful. No filling. */
const R = 46
const C = 2 * Math.PI * R
const PACE = 82      /* מהקצב — primary */
const TO_GOAL = 15   /* מהיעד — secondary */

export default function Step8Preview({ ob, setCTA }) {
  const { t } = useT('onboardingSteps')
  useEffect(() => { setCTA({ onNext: () => ob.advance(), canAdvance: true, busy: false, hint: null }) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const dash = (Math.min(100, Math.max(0, PACE)) / 100) * C

  return (
    <>
      <Box className="ob-preview-card ob-moon-card">
        <Txt as="p" className="ob-preview-title">
          <Moon size={12} strokeWidth={2} aria-hidden="true" /> {t('step8.title')}
        </Txt>

        <Box className="ob-moon-ring">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle className="ob-moon-track" cx="50" cy="50" r={R} strokeWidth="6" fill="none" />
            <circle
              cx="50" cy="50" r={R}
              stroke="var(--sage)" strokeWidth="6" strokeLinecap="round" fill="none"
              strokeDasharray={`${dash} ${C}`}
              transform="rotate(-90 50 50)"
            />
          </svg>
          <Box className="ob-moon-center">
            <Txt className="ob-moon-pct mono">{PACE}%</Txt>
            <Txt className="ob-moon-kicker">{t('step8.kicker')}</Txt>
            <Txt className="ob-moon-sub mono">{t('step8.toGoal', { pct: TO_GOAL })}</Txt>
          </Box>
        </Box>

        <Txt as="p" className="ob-empty-hint ob-moon-explain">
          {t('step8.explain')}
        </Txt>
      </Box>

      <Txt as="p" className="ob-empty-hint" style={{ marginTop: 4 }}>
        {t('step8.nothingToFill')}
      </Txt>

    </>
  )
}
