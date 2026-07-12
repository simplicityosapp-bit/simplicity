import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTours } from '../hooks/useTours'
import { tourFor } from '../lib/tours'
import { useT } from '../i18n/useT'
import './ScreenTour.css'
import { Box, Txt, Btn } from './ui'

/* ════════════════════════════════════════════════════════════════
   <ScreenTour> — first-visit, multi-step spotlight walkthrough.
   ════════════════════════════════════════════════════════════════
   Mounted once in AppShell with the current screen key. On first visit
   to a screen that has a tour (and hasn't been seen), it:
     1. polls the DOM until at least one step target exists,
     2. keeps only the steps whose target is actually rendered,
     3. spotlights each in turn — dim scrim everywhere, glowing ring +
        bubble on the target,
     4. advances on "הבנתי"/"דלג", ends on "דלג על הכל" or the last step,
     5. marks the screen seen in prefs (no re-run).

   It re-measures on resize/scroll and scrolls the target into view, so
   targets below the fold still get spotlighted correctly.
   ════════════════════════════════════════════════════════════════ */

const SCRIM_PAD = 8        /* breathing room around the spotlit element */
const BUBBLE_W = 288       /* keep in sync with .tour-bubble max-width */
const BUBBLE_GAP = 14      /* gap between spotlight and bubble */

export default function ScreenTour({ screenKey }) {
  const { isSeen, markSeen } = useTours()
  const { t: tr } = useT('components')
  /* Tour step title/body are i18n keys (guidance ns, prefixed). Resolve
     them gender-aware via useT, which applies the user's form of address
     as i18next `context` (gendered bodies live as _male/_female in the
     he JSON, falling back to the neutral base). */
  const { t } = useT('guidance')
  const [steps, setSteps] = useState([])     /* resolved (present in DOM) */
  const [idx, setIdx] = useState(0)
  const [rect, setRect] = useState(null)
  const [active, setActive] = useState(false)

  /* Auto-start when the screen changes. Reset first, then poll for the
     targets (the screen may still be mounting / data still loading). */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset tour state on screen change, then poll for the step targets.
    setActive(false); setIdx(0); setRect(null); setSteps([])
    const def = tourFor(screenKey)
    if (!def || isSeen(screenKey)) return

    let tries = 0
    const timer = setInterval(() => {
      tries += 1
      const present = def.filter((s) => document.querySelector(s.target))
      if (present.length) {
        clearInterval(timer)
        setSteps(present)
        setIdx(0)
        setActive(true)
      } else if (tries > 25) {
        clearInterval(timer) /* give up quietly — nothing to point at */
      }
    }, 160)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenKey])

  /* While a tour is active, suppress the standalone coachmark glow/bubble
     so the final CTA step doesn't double up (tour spotlight + coachmark
     pulse). Removed when the tour ends, so the coachmark resumes until
     the button's first click. */
  useEffect(() => {
    if (active) document.body.dataset.tourActive = '1'
    else delete document.body.dataset.tourActive
    return () => { delete document.body.dataset.tourActive }
  }, [active])

  const step = active ? steps[idx] : null

  const measure = useCallback(() => {
    if (!step) return
    const el = document.querySelector(step.target)
    if (!el) return
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [step])

  /* Scroll the current target into view, then measure. Re-measure on
     viewport changes while the step is showing. */
  useLayoutEffect(() => {
    if (!step) return
    const el = document.querySelector(step.target)
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const t = setTimeout(measure, 340)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step, measure])

  if (!active || !step || !rect) return null

  const finish = () => { setActive(false); markSeen(screenKey) }
  const next = () => { if (idx + 1 >= steps.length) finish(); else setIdx((i) => i + 1) }
  const isLast = idx + 1 >= steps.length

  /* Spotlight box (the lit hole). */
  const sx = rect.left - SCRIM_PAD
  const sy = rect.top - SCRIM_PAD
  const sw = rect.width + SCRIM_PAD * 2
  const sh = rect.height + SCRIM_PAD * 2

  /* Bubble placement — below the spotlight if there's room, else above.
     Horizontally centered on the target, clamped to the viewport. */
  const placeBelow = sy + sh + BUBBLE_GAP + 150 < window.innerHeight
  const bubbleTop = placeBelow ? sy + sh + BUBBLE_GAP : undefined
  const bubbleBottom = placeBelow ? undefined : window.innerHeight - sy + BUBBLE_GAP
  let bubbleLeft = rect.left + rect.width / 2 - BUBBLE_W / 2
  bubbleLeft = Math.max(12, Math.min(bubbleLeft, window.innerWidth - BUBBLE_W - 12))

  return createPortal(
    <Box className="tour-root" role="dialog" aria-modal="true" aria-label={t(step.title)}>
      {/* Scrim + spotlight hole (box-shadow trick dims everything else). */}
      <Box
        className={`tour-spot${step.accent === 'sage' ? ' tour-spot--sage' : ''}`}
        style={{
          top: sy, left: sx, width: sw, height: sh,
          borderRadius: step.radius === '50%' ? '999px' : (step.radius || 16),
        }}
      />
      {/* Guidance bubble. */}
      <Box
        className={`tour-bubble${placeBelow ? ' tour-bubble--below' : ' tour-bubble--above'}`}
        style={{ top: bubbleTop, bottom: bubbleBottom, left: bubbleLeft }}
      >
        <Txt as="p" className="tour-bubble-title">{t(step.title)}</Txt>
        <Txt as="p" className="tour-bubble-body">{t(step.body)}</Txt>
        <Box className="tour-bubble-foot">
          <Txt className="tour-bubble-count">{idx + 1}/{steps.length}</Txt>
          <Box className="tour-bubble-btns">
            {/* "דלג" was a duplicate of "הבנתי" (both advanced one step) —
               skipping the whole tour is "דלג על הכל" below. */}
            <Btn type="button" className="tour-btn-next" onClick={next}>
              {isLast ? tr('tour.done') : tr('tour.gotIt')}
            </Btn>
          </Box>
        </Box>
        {!isLast && (
          <Btn type="button" className="tour-skip-all" onClick={finish}>{tr('tour.skipAll')}</Btn>
        )}
      </Box>
    </Box>,
    document.body,
  )
}
