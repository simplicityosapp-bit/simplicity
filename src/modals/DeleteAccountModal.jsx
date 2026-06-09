import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import { ACCOUNT_DELETION_GRACE_DAYS } from '../lib/api/account'
import { useAddress } from '../hooks/useAddress'

/* ════════════════════════════════════════════════════════════════
   DELETE ACCOUNT — permanent removal with a 30-day grace window.
   ════════════════════════════════════════════════════════════════
   Distinct from ResetAccountModal (which only wipes data). Here we
   schedule the whole account for deletion: a DOUBLE confirmation —
     step 1 — plain-language warning + the grace-period promise.
     step 2 — the user must TYPE the confirmation phrase.
   The phrase is "מחיקת חשבון" (NOT the reset modal's "מחיקה"), so
   muscle-memory from the reset flow can't trigger an account delete.
   onConfirm() records the request and may throw; we surface the error
   in plain Hebrew and keep the modal open so nothing is lost silently.
   ════════════════════════════════════════════════════════════════ */

const CONFIRM_PHRASE = 'מחיקת חשבון'

export default function DeleteAccountModal({ open, onClose, onConfirm }) {
  const { addr, tryAgain } = useAddress()
  const [step, setStep] = useState(1)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const close = () => {
    if (busy) return
    setStep(1); setTyped(''); setErr('')
    onClose()
  }

  const run = async () => {
    if (busy || typed.trim() !== CONFIRM_PHRASE) return
    setBusy(true); setErr('')
    try {
      await onConfirm()
      setStep(1); setTyped('')
      onClose()
    } catch (e) {
      setErr(e?.message || 'משהו השתבש — ' + tryAgain + '.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title="מחיקת חשבון לצמיתות">
      <div className="m-confirm-msg" style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
        <AlertTriangle size={20} strokeWidth={1.9} style={{ color: 'var(--clay)', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
        {step === 1 ? (
          <span>
            הפעולה תסמן את <strong>כל החשבון</strong> למחיקה: הפרופיל, כל הנתונים
            (לקוחות, פרויקטים, לידים, תנועות, יעדים, פגישות, תזכורות וכו׳)
            <strong> וגם ההתחברות עצמה</strong>.
            <br />
            יש לך <strong>{ACCOUNT_DELETION_GRACE_DAYS} ימים</strong> להתחרט: בכל
            כניסה בתקופה הזו אפשר לבטל ולחזור לשימוש רגיל. בתום התקופה הכול יימחק
            לצמיתות ו<strong>אי אפשר יהיה לשחזר</strong> או להתחבר שוב עם אותו חשבון.
          </span>
        ) : (
          <span>
            כדי לאשר, {addr({ male: 'הקלד את הביטוי', female: 'הקלידי את הביטוי', neutral: 'הקלד/י את הביטוי' })} <strong>{CONFIRM_PHRASE}</strong> בתיבה.
            מיד לאחר מכן יתחיל מניין {ACCOUNT_DELETION_GRACE_DAYS} הימים.
          </span>
        )}
      </div>

      {step === 2 && (
        <div style={{ marginTop: 4 }}>
          <label className="m-label" htmlFor="delete-account-input">{addr({ male: 'הקלד:', female: 'הקלידי:', neutral: 'הקלד/י:' })} {CONFIRM_PHRASE}</label>
          <input
            id="delete-account-input"
            className={`m-input${typed && typed.trim() !== CONFIRM_PHRASE ? ' err' : ''}`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            autoComplete="off"
            disabled={busy}
          />
        </div>
      )}

      {err && <p className="m-confirm-msg" style={{ color: 'var(--clay)', fontWeight: 600 }}>{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={close} disabled={busy}>ביטול</button>
        {step === 1 ? (
          <button type="button" className="m-btn-save danger" onClick={() => setStep(2)}>
            המשך למחיקה
          </button>
        ) : (
          <button
            type="button"
            className="m-btn-save danger"
            onClick={run}
            disabled={busy || typed.trim() !== CONFIRM_PHRASE}
          >
            {busy ? 'מסמן למחיקה…' : 'מחק את החשבון'}
          </button>
        )}
      </div>
    </Modal>
  )
}
