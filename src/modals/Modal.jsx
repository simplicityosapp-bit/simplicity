import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import './Modal.css'

/* Centered card modal — rendered into document.body via a portal so
   it escapes any ancestor that creates a containing block for
   position:fixed (e.g. a CSS transform on a parent, or — as we hit
   in the home widgets — a `.home-stack .home-widget > *` rule that
   forced `position: relative` onto every direct child including the
   modal nodes). The portal sidesteps the cascade entirely. */
export default function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
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
    </>,
    document.body,
  )
}
