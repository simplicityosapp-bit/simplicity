import { useEffect } from 'react'
import { X } from 'lucide-react'
import './LegalModal.css'

/* ════════════════════════════════════════════════════════════════
   LEGAL MODAL — shared full-screen, scrollable legal-document sheet (RTL).
   `blocks` is an array of: { h } section heading · { h2 } sub-heading ·
   { t } paragraph. Closes on the X, the bottom "סגור" button, Escape, or a
   click on the dimmed backdrop.
   ════════════════════════════════════════════════════════════════ */
export default function LegalModal({ title, meta, blocks, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="legal-overlay" dir="rtl" onClick={onClose}>
      <div
        className="legal-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="legal-head">
          <h2 className="legal-title">{title}</h2>
          <button type="button" className="legal-x" onClick={onClose} aria-label="סגור">
            <X size={20} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </header>

        <div className="legal-body">
          {meta && <p className="legal-meta">{meta}</p>}
          {blocks.map((b, i) => {
            if (b.h) return <h3 key={i} className="legal-h">{b.h}</h3>
            if (b.h2) return <h4 key={i} className="legal-h2">{b.h2}</h4>
            return <p key={i} className="legal-p">{b.t}</p>
          })}
        </div>

        <footer className="legal-foot">
          <button type="button" className="legal-close" onClick={onClose}>סגור</button>
        </footer>
      </div>
    </div>
  )
}
