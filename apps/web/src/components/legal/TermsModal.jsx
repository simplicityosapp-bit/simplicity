import LegalModal from './LegalModal'
import { TERMS_BLOCKS, TERMS_META } from './legalContent'

/* Terms-of-service modal — text lives in legalContent.js (shared with the
   public /legal page). */
export default function TermsModal({ onClose }) {
  return (
    <LegalModal
      title="תנאי שימוש"
      meta={TERMS_META}
      blocks={TERMS_BLOCKS}
      onClose={onClose}
    />
  )
}
