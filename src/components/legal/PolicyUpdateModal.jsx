import { useState } from 'react'
import { Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { buildReacceptance } from '../../lib/legal'
import PrivacyPolicyModal from './PrivacyPolicyModal'
import DPAModal from './DPAModal'
import TermsModal from './TermsModal'
import MG from '../MG'
import './PolicyUpdateModal.css'
import { Box, Txt, Btn, Input } from '../ui'

/* Blocking re-acceptance gate. Shown after login when the accepted privacy or
   terms version is older than the current one (or for existing users who never
   recorded that consent). On confirm it writes the new acceptance to
   user_metadata; the auth user then refreshes (USER_UPDATED) and ConsentGate
   releases the app. Reuses the .auth-check styles (AuthScreen.css is always
   bundled via App.jsx). */
export default function PolicyUpdateModal() {
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [agreeDpa, setAgreeDpa] = useState(false)
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [legalModal, setLegalModal] = useState(null) // 'privacy' | 'dpa' | 'terms' | null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canConsent = agreePrivacy && agreeDpa && agreeTerms

  const confirm = async () => {
    if (!canConsent || busy) return
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ data: buildReacceptance() })
    setBusy(false)
    if (error) setError('שמירת האישור נכשלה. נסה/י שוב.')
    // success → auth user updates → the gate stops rendering this modal.
  }

  return (
    <Box className="policy-update" dir="rtl">
      <Box className="policy-update-card">
        <Txt as="h2" className="policy-update-title">שינינו כמה דברים במדיניות</Txt>
        <Txt as="p" className="policy-update-sub">אנא קרא/י ואשר/י את הגרסאות העדכניות כדי להמשיך.</Txt>
        {error && <Txt as="p" className="policy-update-error">{error}</Txt>}

        <Box className="auth-checks">
          <Box as="label" className="auth-check">
            <Input type="checkbox" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} />
            <Txt className="auth-check-box" aria-hidden="true"><Check size={13} strokeWidth={3} /></Txt>
            <Txt className="auth-check-label">
              קראתי ואני <MG word="agree" /> ל
              <Btn type="button" className="auth-check-link" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLegalModal('privacy') }}>מדיניות הפרטיות</Btn>
            </Txt>
          </Box>
          <Box as="label" className="auth-check">
            <Input type="checkbox" checked={agreeDpa} onChange={(e) => setAgreeDpa(e.target.checked)} />
            <Txt className="auth-check-box" aria-hidden="true"><Check size={13} strokeWidth={3} /></Txt>
            <Txt className="auth-check-label">
              קראתי ואני <MG word="agree" /> ל
              <Btn type="button" className="auth-check-link" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLegalModal('dpa') }}>הסכם עיבוד הנתונים (DPA)</Btn>
            </Txt>
          </Box>
          <Box as="label" className="auth-check">
            <Input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} />
            <Txt className="auth-check-box" aria-hidden="true"><Check size={13} strokeWidth={3} /></Txt>
            <Txt className="auth-check-label">
              קראתי ואני <MG word="agree" /> ל
              <Btn type="button" className="auth-check-link" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLegalModal('terms') }}>תנאי השימוש</Btn>
            </Txt>
          </Box>
        </Box>

        <Btn className="auth-btn auth-btn-primary" type="button" onClick={confirm} disabled={busy || !canConsent}>
          {busy ? 'שומר…' : 'אני מאשר/ת'}
        </Btn>
      </Box>

      {legalModal === 'privacy' && <PrivacyPolicyModal onClose={() => setLegalModal(null)} />}
      {legalModal === 'dpa' && <DPAModal onClose={() => setLegalModal(null)} />}
      {legalModal === 'terms' && <TermsModal onClose={() => setLegalModal(null)} />}
    </Box>
  )
}
