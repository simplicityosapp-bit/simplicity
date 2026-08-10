import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTours } from '../hooks/useTours'
import { tourFor } from '../lib/tours'
import MG from './MG'
import { mgToReadable } from '../lib/multiGender'
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
const VIEWPORT_PAD = 12    /* the bubble never comes closer than this to an edge */
const BUBBLE_H_GUESS = 178 /* first paint only, before the real height is known */

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
  /* The bubble's REAL height, measured after it paints. The placement used to
     assume 150px; the bodies actually render 135-200px, and nothing clamped
     the result — so a target taller than the viewport pushed the bubble clean
     off the top (measured at -545px on a long leads board) and took every
     button with it. The scrim still swallowed clicks and there was no Escape,
     which left the app unusable until a reload — and a reload re-ran the tour,
     because "seen" is only recorded on finish or skip. */
  const bubbleRef = useRef(null)
  const [bubbleH, setBubbleH] = useState(BUBBLE_H_GUESS)

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
        /* Dropping a step whose target is absent is intended — a widget the
           user turned off should not stall the walkthrough. Doing it in total
           silence is not: the finance tour ran four of its five steps for
           however long, because the recurring section's body is unmounted
           while collapsed and nothing said so. Dev-only, so a real user still
           never sees a word about it. */
        if (import.meta.env.DEV && present.length < def.length) {
          const missing = def.filter((s) => !present.includes(s)).map((s) => s.target)
          console.warn(`[tour:${screenKey}] ${present.length}/${def.length} steps — no element for: ${missing.join(', ')}`)
        }
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

  /* Escape ends the tour. It is the reflex for any full-screen overlay, and
     without it the only way out was the two buttons in the bubble — which is
     exactly what goes missing when the placement fails. */
  useEffect(() => {
    if (!active) return undefined
    const onKey = (e) => { if (e.key === 'Escape') { setActive(false); markSeen(screenKey) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, markSeen, screenKey])

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

  /* Measure the bubble once it has painted, and move focus into it. The
     wrapper claims role="dialog" aria-modal="true"; it now behaves like one
     instead of only saying so. Focus lands on the bubble itself rather than
     the primary button, so a keyboard user can Tab to either action without
     the tour hijacking the first Enter. preventScroll because the step has
     just scrolled the target into view and must stay there. */
  useLayoutEffect(() => {
    const el = bubbleRef.current
    if (!el) return
    const h = el.offsetHeight
    if (h && Math.abs(h - bubbleH) > 1) setBubbleH(h)
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true })
  }, [step, rect, bubbleH])

  /* Keep Tab inside the bubble while the tour owns the screen. */
  const onBubbleKeyDown = (e) => {
    if (e.key !== 'Tab') return
    const f = [...(bubbleRef.current?.querySelectorAll('button') || [])]
    if (!f.length) return
    const first = f[0]
    const last = f[f.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

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
     Horizontally centered on the target. BOTH axes are clamped to the
     viewport: the horizontal one always was, and the vertical one is the fix.
     Measured height, not an assumed 150.
     When the spotlit element is taller than the screen there is no room on
     either side of it, and the clamp lands the bubble over the spotlight
     rather than outside the window. Overlapping the thing being explained is
     a poor step; a bubble nobody can see or dismiss is a dead end. */
  const placeBelow = sy + sh + BUBBLE_GAP + bubbleH <= window.innerHeight - VIEWPORT_PAD
  let bubbleTop = placeBelow ? sy + sh + BUBBLE_GAP : sy - BUBBLE_GAP - bubbleH
  bubbleTop = Math.max(
    VIEWPORT_PAD,
    Math.min(bubbleTop, window.innerHeight - bubbleH - VIEWPORT_PAD),
  )
  let bubbleLeft = rect.left + rect.width / 2 - BUBBLE_W / 2
  bubbleLeft = Math.max(VIEWPORT_PAD, Math.min(bubbleLeft, window.innerWidth - BUBBLE_W - VIEWPORT_PAD))

  /* The dialog's own name goes through the same conversion as the body — a
     raw merge glyph here would be announced as an unassigned codepoint. */
  return createPortal(
    <Box className="tour-root" role="dialog" aria-modal="true" aria-label={mgToReadable(t(step.title))}>
      {/* Scrim + spotlight hole (box-shadow trick dims everything else).
          Tapping the lit element advances the step. The glow points at a
          control and the scrim swallows the click, so the one gesture the
          spotlight invites used to do nothing at all — no movement, no
          feedback, on a screen where every other tap is also dead. It cannot
          press the button underneath (the tour is a walkthrough, and a modal
          opening behind the scrim would be worse), but "got it" is exactly
          what the tap means. */}
      <Btn
        type="button"
        aria-label={tr('tour.gotIt')}
        onClick={next}
        className={`tour-spot${step.accent === 'sage' ? ' tour-spot--sage' : ''}`}
        style={{
          top: sy, left: sx, width: sw, height: sh,
          borderRadius: step.radius === '50%' ? '999px' : (step.radius || 16),
        }}
      />
      {/* Guidance bubble. */}
      <Box
        ref={bubbleRef}
        tabIndex={-1}
        onKeyDown={onBubbleKeyDown}
        className={`tour-bubble${placeBelow ? ' tour-bubble--below' : ' tour-bubble--above'}`}
        style={{ top: bubbleTop, left: bubbleLeft }}
      >
        {/* Through <MG>, because some of this copy carries the dual-gender
            merge glyphs ("פעיל׊׉", "לקוח׌"). Those sit on unassigned Unicode
            codepoints: the font draws them, but a screen reader reads garbage.
            <MG> pairs the visible glyph with an sr-only readable form, and
            passes strings without any glyph straight through at no cost. */}
        <Txt as="p" className="tour-bubble-title"><MG text={t(step.title)} /></Txt>
        <Txt as="p" className="tour-bubble-body"><MG text={t(step.body)} /></Txt>
        <Box className="tour-bubble-foot">
          <Txt className="tour-bubble-count">{idx + 1}/{steps.length}</Txt>
          <Box className="tour-bubble-btns">
            {/* "דלג על הכל" sits in the footer as a real peer of "הבנתי",
               not as a faint underlined link tucked underneath it. The home
               tour is seven steps and it runs straight after a nine-step
               onboarding — leaving is a legitimate choice at that point, and
               it should not be the hardest thing on screen to find or to hit.
               ("דלג" alone used to live here too and merely advanced one step,
               duplicating "הבנתי"; that one is gone, this skips the tour.) */}
            {!isLast && (
              <Btn type="button" className="tour-skip-all" onClick={finish}>{tr('tour.skipAll')}</Btn>
            )}
            <Btn type="button" className="tour-btn-next" onClick={next}>
              {isLast ? tr('tour.done') : tr('tour.gotIt')}
            </Btn>
          </Box>
        </Box>
      </Box>
    </Box>,
    document.body,
  )
}
