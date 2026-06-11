import LegalModal from './LegalModal'
import { PRIVACY_BLOCKS, PRIVACY_META } from './legalContent'

/* Privacy Policy modal — text lives in legalContent.js (shared with the
   public /legal page). */
export default function PrivacyPolicyModal({ onClose }) {
  return (
    <LegalModal
      title="מדיניות פרטיות"
      meta={PRIVACY_META}
      blocks={PRIVACY_BLOCKS}
      onClose={onClose}
    />
  )
}
