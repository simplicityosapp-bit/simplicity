import { useState } from 'react'
import { Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { buildReacceptance } from '../../lib/legal'
import PrivacyPolicyModal from './PrivacyPolicyModal'
import DPAModal from './DPAModal'
import './PolicyUpdateModal.css'

/* Blocking re-acceptance gate. Shown after login when the accepted privacy
   version is older than the current one (or for existing users who never
   recorded consent). On confirm it writes the new acceptance to user_metadata;
   the auth user then refreshes (USER_UPDATED) and ConsentGate releases the app.
   Reuses the .auth-check styles (AuthScreen.css is always bundled via App.jsx). */
export default function PolicyUpdateModal() {
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [agreeDpa, setAgreeDpa] = useState(false)
  const [legalModal, setLegalModal] = useState(null) // 'privacy' | 'dpa' | null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canConsent = agreePrivacy && agreeDpa

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
    <div className="policy-update" dir="rtl">
      <div className="policy-update-card">
        <h2 className="policy-update-title">מדיניות הפרטיות עודכנה</h2>
        <p className="policy-update-sub">אנא קרא/י ואשר/י את הגרסה החדשה כדי להמשיך.</p>
        {error && <p className="policy-update-error">{error}</p>}

        <div className="auth-checks">
          <label className="auth-check">
            <input type="checkbox" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} />
            <span className="auth-check-box" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>
            <span className="auth-check-label">
              קראתי ומסכים/ה ל
              <button type="button" className="auth-check-link" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLegalModal('privacy') }}>מדיניות הפרטיות</button>
            </span>
          </label>
          <label className="auth-check">
            <input type="checkbox" checked={agreeDpa} onChange={(e) => setAgreeDpa(e.target.checked)} />
            <span className="auth-check-box" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>
            <span className="auth-check-label">
              קראתי ומסכים/ה ל
              <button type="button" className="auth-check-link" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLegalModal('dpa') }}>הסכם עיבוד הנתונים (DPA)</button>
            </span>
          </label>
        </div>

        <button className="auth-btn auth-btn-primary" type="button" onClick={confirm} disabled={busy || !canConsent}>
          {busy ? 'שומר…' : 'אני מאשר/ת'}
        </button>
      </div>

      {legalModal === 'privacy' && <PrivacyPolicyModal onClose={() => setLegalModal(null)} />}
      {legalModal === 'dpa' && <DPAModal onClose={() => setLegalModal(null)} />}
    </div>
  )
}
