import { useCoachmarks } from '../hooks/useCoachmarks'
import { coachmarkText } from '../lib/coachmarks'
import { useAddress } from '../hooks/useAddress'
import './Coachmark.css'
import { Txt } from './ui'

/* ════════════════════════════════════════════════════════════════
   <Coachmark> — first-touch glow + guidance bubble around a button.
   ════════════════════════════════════════════════════════════════
   Wraps a single interactive child (a button). While the coachmark
   id is still "virgin" (never interacted), it paints a pulsing glow
   ring around the child and a short guidance bubble beside it. The
   first click anywhere in the wrapper marks the id seen, so the glow
   disappears for good — even if no record was created.

   The wrapper element itself is always rendered (an inline-flex span),
   so the child's DOM identity stays stable across the dismiss — the
   original click still reaches the button normally.

   `satisfied` is the screen saying it has rows already. The copy is
   first-touch copy — "הגדר/י יעד ראשון", "פתח/י את הפרויקט הראשון" — and
   the flag exists because onboarding now CREATES a project, a client and
   a goal before the user ever reaches those screens. Without it the first
   visit to /goals pulsed at a "+" and offered to make a first goal beside
   the goal the user had just made. Dismissal is by click, so nothing
   about a row's existence could reach it.

   Props:
     - id:        coachmark id (key in prefs.coachmarks + registry).
     - placement: 'bottom' | 'top' | 'start' | 'end' (default bottom).
     - radius:    border-radius of the glow ring (default 20px; pass
                  '50%' for the circular .cta-add).
     - bubble:    override the registry bubble text (optional).
     - satisfied: the screen already holds what the button creates, so
                  there is nothing to introduce. Renders the child bare.
   ════════════════════════════════════════════════════════════════ */

export default function Coachmark({ id, placement = 'bottom', radius, bubble, satisfied = false, className = '', children }) {
  const { isVirgin, dismiss } = useCoachmarks()
  const { gender } = useAddress()
  const virgin = isVirgin(id) && !satisfied
  const text = bubble ?? coachmarkText(id, gender).bubble

  /* Capture-phase so we mark seen before the child's own handler runs;
     we never stop propagation, so the button still fires normally. */
  const handleClickCapture = () => {
    if (virgin) dismiss(id)
  }

  const style = radius ? { '--cm-radius': radius } : undefined

  return (
    <Txt
      className={`coachmark${virgin ? ' is-virgin' : ''} coachmark--${placement}${className ? ` ${className}` : ''}`}
      style={style}
      onClickCapture={handleClickCapture}
    >
      {virgin && <Txt className="coachmark-glow" aria-hidden="true" />}
      {children}
      {virgin && text && (
        <Txt className="coachmark-bubble" role="status">{text}</Txt>
      )}
    </Txt>
  )
}
