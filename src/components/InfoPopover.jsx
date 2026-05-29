import { useEffect, useRef, useState } from 'react'
import { HelpCircle } from 'lucide-react'

/* Small reusable "?" icon → popover. Hover opens on desktop, tap
   toggles on mobile. Click outside or Escape closes. The popover
   is rendered next to the trigger via absolute positioning — no
   portal, no library. Pass `text` for the explanation; the
   component handles its own visibility. */
export default function InfoPopover({ text, label, placement = 'bottom' }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
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

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
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
    <span
      className="info-pop"
      ref={wrapRef}
      onMouseEnter={() => { cancelClose(); setOpen(true) }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className="info-pop-btn"
        aria-label={label || 'הסבר'}
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
      >
        <HelpCircle size={13} strokeWidth={1.7} aria-hidden="true" />
      </button>
      {open && (
        <span
          className={`info-pop-body info-pop-${placement}`}
          role="tooltip"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          {text}
        </span>
      )}
    </span>
  )
}
