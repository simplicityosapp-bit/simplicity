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

  return (
    <span
      className="info-pop"
      ref={wrapRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
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
        <span className={`info-pop-body info-pop-${placement}`} role="tooltip">
          {text}
        </span>
      )}
    </span>
  )
}
