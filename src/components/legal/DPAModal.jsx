import LegalModal from './LegalModal'
import { DPA_BLOCKS, DPA_META } from './legalContent'

/* DPA modal — text lives in legalContent.js (shared with the public /legal page). */
export default function DPAModal({ onClose }) {
  return (
    <LegalModal
      title="הסכם עיבוד נתונים (DPA)"
      meta={DPA_META}
      blocks={DPA_BLOCKS}
      onClose={onClose}
    />
  )
}
