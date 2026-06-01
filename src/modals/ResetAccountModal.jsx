import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import Modal from './Modal'

/* ════════════════════════════════════════════════════════════════
   RESET ACCOUNT — irreversible "delete everything" with a DOUBLE
   confirmation:
     step 1 — a plain-language warning of exactly what will be erased.
     step 2 — the user must TYPE the confirmation word, so it can't be
              triggered by a stray click.
   onConfirm() does the actual wipe and may throw; we surface the error
   in plain Hebrew and keep the modal open so nothing is lost silently.
   ════════════════════════════════════════════════════════════════ */

const CONFIRM_WORD = 'מחיקה'

export default function ResetAccountModal({ open, onClose, onConfirm }) {
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
    if (busy || typed.trim() !== CONFIRM_WORD) return
    setBusy(true); setErr('')
    try {
      await onConfirm()
      setStep(1); setTyped('')
      onClose()
    } catch (e) {
      setErr(e?.message || 'משהו השתבש — נסה/י שוב.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title="איפוס חשבון — מחיקת כל הנתונים">
      <div className="m-confirm-msg" style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
        <AlertTriangle size={20} strokeWidth={1.9} style={{ color: 'var(--clay)', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
        {step === 1 ? (
          <span>
            הפעולה תמחק <strong>את כל הנתונים בחשבון</strong>: לקוחות, פרויקטים, לידים,
            תנועות והוצאות חוזרות, קבוצות, משימות, יעדים, תזכורות, סטטוסים, מקורות
            ופגישות.
            <br />
            <strong>אי אפשר לבטל את הפעולה.</strong> ההכרות (אונבורדינג) תתחיל מחדש כדי שתוכל/י להתחיל מאפס.
          </span>
        ) : (
          <span>
            כדי לאשר סופית, הקלד/י את המילה <strong>{CONFIRM_WORD}</strong> בתיבה.
            זהו אישור אחרון — מיד לאחר מכן הכול יימחק.
          </span>
        )}
      </div>

      {step === 2 && (
        <div style={{ marginTop: 4 }}>
          <label className="m-label" htmlFor="reset-confirm-input">הקלד/י: {CONFIRM_WORD}</label>
          <input
            id="reset-confirm-input"
            className={`m-input${typed && typed.trim() !== CONFIRM_WORD ? ' err' : ''}`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={CONFIRM_WORD}
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
            disabled={busy || typed.trim() !== CONFIRM_WORD}
          >
            {busy ? 'מוחק…' : 'מחק הכל לצמיתות'}
          </button>
        )}
      </div>
    </Modal>
  )
}
