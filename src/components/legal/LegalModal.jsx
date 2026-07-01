import { useEffect } from 'react'
import { X } from 'lucide-react'
import './LegalModal.css'
import { Box, Txt, Btn } from '../ui'

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
    <Box className="legal-overlay" dir="rtl" onClick={onClose}>
      <Box
        className="legal-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <Box as="header" className="legal-head">
          <Txt as="h2" className="legal-title">{title}</Txt>
          <Btn type="button" className="legal-x" onClick={onClose} aria-label="סגור">
            <X size={20} strokeWidth={1.5} aria-hidden="true" />
          </Btn>
        </Box>

        <Box className="legal-body">
          {meta && <Txt as="p" className="legal-meta">{meta}</Txt>}
          {blocks.map((b, i) => {
            if (b.h) return <Txt as="h3" key={i} className="legal-h">{b.h}</Txt>
            if (b.h2) return <Txt as="h4" key={i} className="legal-h2">{b.h2}</Txt>
            return <Txt as="p" key={i} className="legal-p">{b.t}</Txt>
          })}
        </Box>

        <Box as="footer" className="legal-foot">
          <Btn type="button" className="legal-close" onClick={onClose}>סגור</Btn>
        </Box>
      </Box>
    </Box>
  )
}
