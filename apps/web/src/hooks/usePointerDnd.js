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

   AUTO-SCROLL. Because native scrolling is suppressed for the duration, a drop
   target that is off-screen used to be simply unreachable — on a 375px phone
   the leads board is 875px wide, so "in process" → "not relevant" could not be
   done at all, and the same wall hit any drag whose target sat below the fold.
   Holding the pointer near an edge now scrolls the nearest scrollable ancestor
   (either axis), falling through to the page, and the drop zone under the
   pointer is re-resolved each frame so the highlight tracks what slides in.

   Usage:
     const dnd = usePointerDnd({ onDrop: (id, zone) => move(id, zone) })
     <Card {...dnd.draggableProps(card.id)} className={dnd.dragId === card.id ? 'dragging' : ''} />
     <Zone {...dnd.dropZoneProps(zoneId)} className={dnd.overZone === zoneId ? 'drag-over' : ''} /> */

const LONG_PRESS_MS = 240
const MOVE_THRESHOLD = 8
/* Auto-scroll: how close to a scrollable edge the pointer has to get before
   the container starts moving, and the top speed once it is right on it. */
const EDGE = 56
const MAX_SPEED = 18

/* How fast to scroll along one axis given where the pointer sits between two
   edges. 0 in the middle; ramps to MAX_SPEED as the pointer reaches an edge,
   so a small nudge creeps and a firm push flies. */
function edgeDelta(pos, min, max) {
  if (pos < min + EDGE) return -Math.ceil(Math.min(1, (min + EDGE - pos) / EDGE) * MAX_SPEED)
  if (pos > max - EDGE) return Math.ceil(Math.min(1, (pos - (max - EDGE)) / EDGE) * MAX_SPEED)
  return 0
}

/* Scroll an element and report whether it actually moved. Asking the browser
   and comparing sidesteps the whole RTL question: horizontal scrollLeft runs
   negative in RTL, so computing the valid range by hand would need to know the
   direction — this just tries, and a container already at its end reports
   false so the walk continues to the next scrollable ancestor. */
function tryScroll(el, dx, dy) {
  let moved = false
  if (dx) {
    const before = el.scrollLeft
    el.scrollLeft = before + dx
    if (el.scrollLeft !== before) moved = true
  }
  if (dy) {
    const before = el.scrollTop
    el.scrollTop = before + dy
    if (el.scrollTop !== before) moved = true
  }
  return moved
}

const SCROLLABLE = /(auto|scroll)/

/* CSS scroll-snap silently EATS programmatic scrolling: the leads board is
   `scroll-snap-type: x mandatory`, and with a column-sized snap point every
   18px step we ask for is snapped straight back, so scrollLeft never moves at
   all. Snap is therefore suspended on each container we actually drive, and
   restored the moment the drag ends (the browser then settles it to the
   nearest snap point on its own). The previous INLINE value is what gets
   remembered, so a container that had none goes back to having none and the
   stylesheet keeps ownership. */
function suspendSnap(el, snapped) {
  if (snapped.has(el)) return
  const cur = getComputedStyle(el).scrollSnapType
  if (cur && cur !== 'none') {
    snapped.set(el, el.style.scrollSnapType)
    el.style.scrollSnapType = 'none'
  }
}

function restoreSnap(snapped) {
  if (!snapped) return
  snapped.forEach((prev, el) => { el.style.scrollSnapType = prev })
  snapped.clear()
}

/* One auto-scroll tick for a pointer at (x,y): walk out from whatever sits
   under it and give the scroll to the first ancestor that can still move,
   falling through to the page when nothing inside it takes the movement.
   Exported so the behaviour can be driven directly against real layout —
   it needs elementFromPoint and getComputedStyle, so it is only meaningful
   in a browser, not in the DOM-less unit suite. */
export function autoScrollOnce(x, y, snapped = new Map()) {
  let el = document.elementFromPoint(x, y)
  while (el) {
    const st = getComputedStyle(el)
    const canX = SCROLLABLE.test(st.overflowX) && el.scrollWidth > el.clientWidth
    const canY = SCROLLABLE.test(st.overflowY) && el.scrollHeight > el.clientHeight
    if (canX || canY) {
      const r = el.getBoundingClientRect()
      const dx = canX ? edgeDelta(x, r.left, r.right) : 0
      const dy = canY ? edgeDelta(y, r.top, r.bottom) : 0
      if (dx || dy) {
        suspendSnap(el, snapped)
        if (tryScroll(el, dx, dy)) return
      }
    }
    el = el.parentElement
  }
  const doc = document.scrollingElement
  if (doc) {
    const dx = edgeDelta(x, 0, window.innerWidth)
    const dy = edgeDelta(y, 0, window.innerHeight)
    if (dx || dy) {
      suspendSnap(doc, snapped)
      tryScroll(doc, dx, dy)
    }
  }
}

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
    if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0 }
    restoreSnap(s.snapped)
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

    s.last = { x, y }
    s.snapped = new Map()
    s.onMove = (ev) => {
      s.ghost.style.left = `${ev.clientX - s.offX}px`
      s.ghost.style.top = `${ev.clientY - s.offY}px`
      s.last = { x: ev.clientX, y: ev.clientY }
      setOverZone(zoneAt(ev.clientX, ev.clientY))
    }
    s.onUp = (ev) => {
      const z = zoneAt(ev.clientX, ev.clientY)
      end(true)
      if (z != null && onDrop) onDrop(id, z)
    }
    /* Native scrolling stays blocked — the drag owns the gesture. Auto-scroll
       below is what gives the movement back, under our control. */
    s.onTouch = (ev) => { if (ev.cancelable) ev.preventDefault() }
    document.addEventListener('pointermove', s.onMove)
    document.addEventListener('pointerup', s.onUp)
    document.addEventListener('pointercancel', s.onUp)
    document.addEventListener('touchmove', s.onTouch, { passive: false })

    /* Auto-scroll runs on its own frame loop rather than off pointermove,
       because at the edge the pointer is usually HELD STILL while the
       container catches up — driving it from movement would make the user
       jiggle their thumb to keep going. Each frame also re-resolves the drop
       zone, so the highlight follows whatever slides under a stationary
       pointer. Setting the same zone is a no-op in React, so that costs
       nothing on the frames where nothing changed. */
    const step = () => {
      if (!s.active) return
      if (s.last) {
        autoScrollOnce(s.last.x, s.last.y, s.snapped)
        setOverZone(zoneAt(s.last.x, s.last.y))
      }
      s.raf = requestAnimationFrame(step)
    }
    s.raf = requestAnimationFrame(step)
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
