import { useCallback, useEffect, useRef, useState } from 'react'

/* Pointer-based drag-and-drop that works on touch AND mouse — a replacement
   for HTML5 draggable/onDrop (which never fires on touch). Activation:
   - touch: long-press (hold still ~240ms) to pick up; moving before that is
     treated as a scroll and cancels (so lists still scroll normally).
   - mouse/pen: moving past a small threshold starts the drag immediately.
   While a drag is active we block touch scrolling with a non-passive
   `touchmove` preventDefault, float a ghost of the source, and hit-test the
   element under the pointer for the nearest `[data-dnd-zone]`. On release
   over a zone we call onDrop(dragId, zoneId) and swallow the click that would
   otherwise follow (so a card doesn't also "open").

   Usage:
     const dnd = usePointerDnd({ onDrop: (id, zone) => move(id, zone) })
     <Card {...dnd.draggableProps(card.id)} className={dnd.dragId === card.id ? 'dragging' : ''} />
     <Zone {...dnd.dropZoneProps(zoneId)} className={dnd.overZone === zoneId ? 'drag-over' : ''} /> */

const LONG_PRESS_MS = 240
const MOVE_THRESHOLD = 8

export function usePointerDnd({ onDrop } = {}) {
  const [dragId, setDragId] = useState(null)
  const [overZone, setOverZone] = useState(null)
  const ref = useRef({})

  const zoneAt = (x, y) => {
    const el = document.elementFromPoint(x, y)
    const z = el && el.closest('[data-dnd-zone]')
    return z ? z.getAttribute('data-dnd-zone') : null
  }

  const end = useCallback((didDrop) => {
    const s = ref.current
    if (s.timer) { clearTimeout(s.timer); s.timer = 0 }
    if (s.ghost) { s.ghost.remove(); s.ghost = null }
    document.removeEventListener('pointermove', s.onPre, true)
    document.removeEventListener('pointerup', s.onPreUp, true)
    document.removeEventListener('pointermove', s.onMove)
    document.removeEventListener('pointerup', s.onUp)
    document.removeEventListener('pointercancel', s.onUp)
    document.removeEventListener('touchmove', s.onTouch)
    s.active = false
    setDragId(null)
    setOverZone(null)
    if (didDrop) {
      /* Swallow the click that fires right after a drag so the source
         element's onClick (e.g. "open card") doesn't also run. */
      const swallow = (ce) => { ce.preventDefault(); ce.stopPropagation() }
      document.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => document.removeEventListener('click', swallow, true), 320)
    }
  }, [])

  const activate = useCallback((id, x, y, sourceEl) => {
    const s = ref.current
    s.active = true
    const rect = sourceEl.getBoundingClientRect()
    const ghost = sourceEl.cloneNode(true)
    Object.assign(ghost.style, {
      position: 'fixed', margin: '0',
      left: `${rect.left}px`, top: `${rect.top}px`,
      width: `${rect.width}px`, height: `${rect.height}px`,
      pointerEvents: 'none', zIndex: '9999', opacity: '0.92',
      transform: 'scale(1.03)', boxShadow: '0 14px 36px rgba(0,0,0,0.30)',
      borderRadius: getComputedStyle(sourceEl).borderRadius,
    })
    ghost.classList.add('dnd-ghost')
    document.body.appendChild(ghost)
    s.ghost = ghost
    s.offX = x - rect.left
    s.offY = y - rect.top
    setDragId(id)
    if (navigator.vibrate) { try { navigator.vibrate(8) } catch { /* ignore */ } }

    s.onMove = (ev) => {
      s.ghost.style.left = `${ev.clientX - s.offX}px`
      s.ghost.style.top = `${ev.clientY - s.offY}px`
      setOverZone(zoneAt(ev.clientX, ev.clientY))
    }
    s.onUp = (ev) => {
      const z = zoneAt(ev.clientX, ev.clientY)
      end(true)
      if (z != null && onDrop) onDrop(id, z)
    }
    s.onTouch = (ev) => { if (ev.cancelable) ev.preventDefault() } // stop scroll while dragging
    document.addEventListener('pointermove', s.onMove)
    document.addEventListener('pointerup', s.onUp)
    document.addEventListener('pointercancel', s.onUp)
    document.addEventListener('touchmove', s.onTouch, { passive: false })
  }, [end, onDrop])

  const draggableProps = useCallback((id) => ({
    onPointerDown: (e) => {
      if (e.button != null && e.button > 0) return // ignore right/middle click
      /* Don't hijack presses on interactive children (delete/convert buttons,
         links, form controls) — let them behave normally. */
      if (e.target.closest && e.target.closest('button, a, input, select, textarea, [data-no-drag]')) return
      const s = ref.current
      if (s.active) return
      const sourceEl = e.currentTarget
      const sx = e.clientX
      const sy = e.clientY
      const touch = e.pointerType === 'touch'

      s.onPre = (ev) => {
        const moved = Math.abs(ev.clientX - sx) > MOVE_THRESHOLD || Math.abs(ev.clientY - sy) > MOVE_THRESHOLD
        if (!moved) return
        document.removeEventListener('pointermove', s.onPre, true)
        document.removeEventListener('pointerup', s.onPreUp, true)
        if (touch) {
          if (s.timer) { clearTimeout(s.timer); s.timer = 0 } // moved first → scroll, not drag
        } else {
          activate(id, ev.clientX, ev.clientY, sourceEl) // mouse/pen: drag on move
        }
      }
      s.onPreUp = () => {
        if (s.timer) { clearTimeout(s.timer); s.timer = 0 }
        document.removeEventListener('pointermove', s.onPre, true)
        document.removeEventListener('pointerup', s.onPreUp, true)
      }
      document.addEventListener('pointermove', s.onPre, true)
      document.addEventListener('pointerup', s.onPreUp, true)
      if (touch) {
        s.timer = setTimeout(() => {
          document.removeEventListener('pointermove', s.onPre, true)
          document.removeEventListener('pointerup', s.onPreUp, true)
          activate(id, sx, sy, sourceEl)
        }, LONG_PRESS_MS)
      }
    },
  }), [activate])

  const dropZoneProps = useCallback((zoneId) => ({ 'data-dnd-zone': String(zoneId) }), [])

  /* Clean up listeners/ghost if the component unmounts mid-drag. */
  useEffect(() => () => end(false), [end])

  return { dragId, overZone, draggableProps, dropZoneProps }
}
