import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Moon, CheckCircle2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ROUTES } from '../../lib/routes'
import { translateAuthError } from '../../auth/authErrors'
import { useAuth } from '../../auth/AuthContext'
import './AuthScreen.css'

/* Completion screen for the password-reset flow. The recovery email links to
   /update-password, where Supabase has already exchanged the recovery token
   into a session (detectSessionInUrl). Here the user actually sets a NEW
   password via updateUser({ password }). Without this screen the reset flow
   was a dead end — the link logged the user in but never let them change it.
   Doubles as a "change password" screen for any signed-in user. */
export default function UpdatePasswordScreen() {
  const navigate = useNavigate()
  const { clearRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('הסיסמה צריכה להיות באורך 6 תווים לפחות.'); return }
    if (password !== confirm) { setError('הסיסמאות אינן תואמות.'); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) { setError(translateAuthError(error.message)); return }
    setDone(true)
  }

  if (done) {
    return (
      <div className="auth-wrap">
        <div className="auth-card auth-card-msg">
          <span className="auth-msg-icon"><CheckCircle2 size={34} strokeWidth={1.4} aria-hidden="true" /></span>
          <p className="auth-title">הסיסמה עודכנה</p>
          <p className="auth-sub">אפשר להמשיך לאפליקציה עם הסיסמה החדשה.</p>
          <button type="button" className="auth-btn" onClick={() => { clearRecovery?.(); navigate(ROUTES.HOME, { replace: true }) }}>המשך לאפליקציה</button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand"><Moon size={22} strokeWidth={1.6} aria-hidden="true" /><span>Simplicity</span></div>
        <p className="auth-title">בחירת סיסמה חדשה</p>
        <p className="auth-sub">הזן/י סיסמה חדשה לחשבון</p>

        {error && <p className="auth-error">{error}</p>}

        <label className="auth-label" htmlFor="new-password">סיסמה חדשה</label>
        <input id="new-password" className="auth-input" type="password" dir="ltr" autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)} placeholder="לפחות 6 תווים" />

        <label className="auth-label" htmlFor="confirm-password">אימות סיסמה</label>
        <input id="confirm-password" className="auth-input" type="password" dir="ltr" autoComplete="new-password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="הקלד/י שוב" />

        <button className="auth-btn" type="submit" disabled={busy}>{busy ? 'מעדכן…' : 'עדכון סיסמה'}</button>
      </form>
    </div>
  )
}
