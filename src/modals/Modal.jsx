import { useEffect } from 'react'
import { X } from 'lucide-react'
import './Modal.css'

/* Bottom-sheet modal — slides up from the bottom, framed to the app width,
   position:fixed so it overlays the bottom nav. */
export default function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      <div className={`m-overlay${open ? ' open' : ''}`} onClick={onClose} aria-hidden="true" />
      <div className={`m-sheet${open ? ' open' : ''}`} role="dialog" aria-modal="true" aria-hidden={!open} aria-label={title}>
        <div className="m-head">
          <p className="m-title">{title}</p>
          <button type="button" className="m-close" onClick={onClose} aria-label="סגור">
            <X size={18} strokeWidth={1.6} />
          </button>
        </div>
        <div className="m-body">{children}</div>
      </div>
    </>
  )
}
