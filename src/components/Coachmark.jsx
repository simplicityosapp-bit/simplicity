import { useCoachmarks } from '../hooks/useCoachmarks'
import { coachmarkText } from '../lib/coachmarks'
import './Coachmark.css'

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

   Props:
     - id:        coachmark id (key in prefs.coachmarks + registry).
     - placement: 'bottom' | 'top' | 'start' | 'end' (default bottom).
     - radius:    border-radius of the glow ring (default 20px; pass
                  '50%' for the circular .cta-add).
     - bubble:    override the registry bubble text (optional).
   ════════════════════════════════════════════════════════════════ */

export default function Coachmark({ id, placement = 'bottom', radius, bubble, className = '', children }) {
  const { isVirgin, dismiss } = useCoachmarks()
  const virgin = isVirgin(id)
  const text = bubble ?? coachmarkText(id).bubble

  /* Capture-phase so we mark seen before the child's own handler runs;
     we never stop propagation, so the button still fires normally. */
  const handleClickCapture = () => {
    if (virgin) dismiss(id)
  }

  const style = radius ? { '--cm-radius': radius } : undefined

  return (
    <span
      className={`coachmark${virgin ? ' is-virgin' : ''} coachmark--${placement}${className ? ` ${className}` : ''}`}
      style={style}
      onClickCapture={handleClickCapture}
    >
      {virgin && <span className="coachmark-glow" aria-hidden="true" />}
      {children}
      {virgin && text && (
        <span className="coachmark-bubble" role="status">{text}</span>
      )}
    </span>
  )
}
