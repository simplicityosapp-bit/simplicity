import { useCallback, useEffect, useRef, useState } from 'react'
import { moveWidgetBefore, setWidgetVisible } from '../lib/preferences'

/* ════════════════════════════════════════════════════════════════
   HOME EDIT MODE — long-press to enter, drag to reorder, ✕ to hide.
   ════════════════════════════════════════════════════════════════
   The phone-home-screen gesture, because it is the one arrangement gesture
   people already know. Rearranging used to live behind Settings → widgets, a
   list of ~45 controls describing a screen you could not see while using it.

   Pointer Events throughout, not HTML5 drag-and-drop: DnD does not fire on
   touch, which is where this gesture comes from. One code path covers mouse,
   touch and pen.

   Reordering picks the widget whose CENTRE is nearest the pointer rather than
   comparing y-positions, because home is a vertical stack on mobile and a
   four-column grid on desktop — a y-only comparison would be wrong the moment
   two widgets share a row.

   All list maths lives in lib/preferences as pure functions; this hook only
   turns gestures into calls.
   ════════════════════════════════════════════════════════════════ */

const LONG_PRESS_MS = 450
/* Past this much movement it is a scroll or a drag, not a press-and-hold. */
const MOVE_TOLERANCE = 10

export function useHomeEdit({ list, onChange, stackRef }) {
  const [editing, setEditing] = useState(false)
  const [draggingId, setDraggingId] = useState(null)

  const timerRef = useRef(null)
  const originRef = useRef(null)
  /* A long-press ends with a pointerup, which the browser follows with a
     click. Without this the press that ENTERS edit mode also activates
     whatever was under the finger. */
  const swallowClickRef = useRef(false)

  const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } }

  const exit = useCallback(() => { setEditing(false); setDraggingId(null); clearTimer() }, [])

  /* Escape leaves edit mode — the same way every other transient mode in the
     app closes. */
  useEffect(() => {
    if (!editing) return undefined
    const onKey = (e) => { if (e.key === 'Escape') exit() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, exit])

  useEffect(() => () => clearTimer(), [])

  /* Which widget is under this point. Nearest centre, so it works in both the
     stack and the grid. */
  const widgetAt = useCallback((x, y) => {
    const root = stackRef.current
    if (!root) return null
    let best = null
    let bestDist = Infinity
    root.querySelectorAll('[data-widget-id]').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2))
      if (d < bestDist) { bestDist = d; best = el.getAttribute('data-widget-id') }
    })
    return best
  }, [stackRef])

  const onPointerDown = useCallback((e, id) => {
    /* Secondary buttons and anything already being dragged are not our
       business. */
    if (e.button != null && e.button !== 0) return
    originRef.current = { x: e.clientX, y: e.clientY, id }

    if (editing) {
      setDraggingId(id)
      try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* not fatal */ }
      return
    }
    clearTimer()
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      swallowClickRef.current = true
      setEditing(true)
      setDraggingId(null)
    }, LONG_PRESS_MS)
  }, [editing])

  const onPointerMove = useCallback((e) => {
    const origin = originRef.current
    if (!origin) return

    /* Still waiting on the hold: any real movement means the user is
       scrolling, so abandon the long-press. */
    if (timerRef.current) {
      if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > MOVE_TOLERANCE) clearTimer()
      return
    }

    if (!editing || !draggingId) return
    const over = widgetAt(e.clientX, e.clientY)
    if (over && over !== draggingId) onChange(moveWidgetBefore(list, draggingId, over))
  }, [editing, draggingId, list, onChange, widgetAt])

  const onPointerUp = useCallback(() => {
    clearTimer()
    originRef.current = null
    setDraggingId(null)
  }, [])

  /* Attached in capture so it runs before the widget's own handlers. */
  const onClickCapture = useCallback((e) => {
    if (!swallowClickRef.current) return
    swallowClickRef.current = false
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const hide = useCallback((id) => onChange(setWidgetVisible(list, id, false)), [list, onChange])
  const show = useCallback((id) => onChange(setWidgetVisible(list, id, true)), [list, onChange])

  return {
    editing, draggingId,
    enter: () => setEditing(true),
    exit,
    hide, show,
    widgetProps: (id) => ({
      onPointerDown: (e) => onPointerDown(e, id),
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    }),
    onClickCapture,
  }
}
