import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle } from 'lucide-react'
import { useT } from '../i18n/useT'
import { Txt, Btn } from './ui'

/* Small reusable "?" icon → popover. Hover opens on desktop, tap toggles
   on mobile. Click outside or Escape closes.

   The popover body is rendered through a PORTAL to <body> (not as an
   absolutely-positioned child). The trigger lives inside glass cards whose
   backdrop-filter creates their own stacking context, so an in-card popover
   — even at a high local z-index — was painted under sibling cards. Porting
   it to <body> with a fixed, viewport-anchored position guarantees it always
   sits above page content. Coordinates are computed from the trigger rect and
   kept in sync on scroll/resize. */
export default function InfoPopover({ text, label, placement = 'bottom' }) {
  const { t } = useT('components')
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)
  const wrapRef = useRef(null)
  const bodyRef = useRef(null)
  /* Small close delay so moving the cursor from the trigger button into
     the popover body (across the 6px gap) doesn't snap it shut mid-traverse.
     onMouseEnter on either element cancels the pending close. */
  const closeTimer = useRef(null)
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), 180)
  }
  const cancelClose = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }

  /* Anchor the fixed-position body to the trigger: right-aligned to the
     trigger's inline-end (RTL), below it for 'bottom' / above for 'top'.
     Recompute while open so it tracks scroll and viewport changes. */
  useLayoutEffect(() => {
    if (!open) return undefined
    const place = () => {
      const r = wrapRef.current?.getBoundingClientRect()
      if (!r) return
      const right = Math.max(8, window.innerWidth - r.right - 4)
      setCoords(placement === 'top'
        ? { right, bottom: window.innerHeight - r.top + 6 }
        : { right, top: r.bottom + 6 })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, placement])

  useEffect(() => {
    if (!open) return undefined
    const onClick = (e) => {
      /* The body lives in a portal (outside wrapRef), so check both. */
      if (wrapRef.current?.contains(e.target)) return
      if (bodyRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => () => cancelClose(), [])

  return (
    <Txt
      className="info-pop"
      ref={wrapRef}
      onMouseEnter={() => { cancelClose(); setOpen(true) }}
      onMouseLeave={scheduleClose}
    >
      <Btn
        type="button"
        className="info-pop-btn"
        aria-label={label || t('infoPopover.label')}
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
      >
        <HelpCircle size={13} strokeWidth={1.7} aria-hidden="true" />
      </Btn>
      {open && coords && createPortal(
        <Txt
          ref={bodyRef}
          className="info-pop-body"
          role="tooltip"
          style={{ position: 'fixed', top: coords.top, bottom: coords.bottom, right: coords.right }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          {text}
        </Txt>,
        document.body,
      )}
    </Txt>
  )
}
