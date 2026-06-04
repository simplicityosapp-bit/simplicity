import { useState } from 'react'
import { AlertTriangle, RotateCcw, LogOut } from 'lucide-react'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { useAuth } from '../auth/AuthContext'
import './AccountDeletionPending.css'

/* ════════════════════════════════════════════════════════════════
   ACCOUNT DELETION PENDING — the locked grace-period gate.
   ════════════════════════════════════════════════════════════════
   Shown by AppShell whenever prefs.accountDeletion.scheduled_for is
   set (see App.jsx). The whole app is locked behind this screen until
   the user either CANCELS (clears the request → back to normal use) or
   the grace window passes and a scheduled edge function deletes the
   auth user for real. Data is NOT deleted during the grace window, so
   canceling fully restores the account — we just clear the flag.
   ════════════════════════════════════════════════════════════════ */

/* Whole days left until the scheduled deletion (never negative). */
function daysLeft(scheduledFor) {
  const ms = new Date(scheduledFor).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86400000))
}

export default function AccountDeletionPending() {
  const { prefs, update } = useUserPreferences()
  const { signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const del = prefs?.accountDeletion || {}
  const left = del.scheduled_for ? daysLeft(del.scheduled_for) : 0
  const targetDate = del.scheduled_for
    ? new Date(del.scheduled_for).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  const cancel = async () => {
    if (busy) return
    setBusy(true); setErr('')
    try {
      await update({ accountDeletion: null })
      /* On success the AppShell gate re-renders and the app returns to
         normal — nothing else to do here. */
    } catch (e) {
      setErr(e?.message || 'הביטול נכשל — נסה/י שוב.')
      setBusy(false)
    }
  }

  return (
    <div className="adp-wrap" dir="rtl">
      <div className="adp-card anim">
        <span className="adp-icon" aria-hidden="true">
          <AlertTriangle size={30} strokeWidth={1.7} />
        </span>
        <h1 className="adp-title">החשבון מתוזמן למחיקה</h1>

        <div className="adp-countdown">
          <span className="adp-count-num mono">{left}</span>
          <span className="adp-count-unit">{left === 1 ? 'יום' : 'ימים'} עד המחיקה</span>
        </div>

        <p className="adp-body">
          ביקשת למחוק את החשבון. כל הנתונים עדיין שמורים — אם תתחרט/י, אפשר לבטל
          עכשיו ולחזור לשימוש רגיל.
          {targetDate && (
            <>
              {' '}אחרת, ב־<strong>{targetDate}</strong> הכול יימחק לצמיתות
              ואי אפשר יהיה לשחזר או להתחבר שוב.
            </>
          )}
        </p>

        {err && <p className="adp-err">{err}</p>}

        <button type="button" className="adp-btn-cancel" onClick={cancel} disabled={busy}>
          <RotateCcw size={17} strokeWidth={1.8} aria-hidden="true" />
          {busy ? 'מבטל…' : 'בטל מחיקה ושחזר את החשבון'}
        </button>
        <button type="button" className="adp-btn-logout" onClick={() => signOut()} disabled={busy}>
          <LogOut size={16} strokeWidth={1.7} aria-hidden="true" />
          התנתקות
        </button>
      </div>
    </div>
  )
}
