import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Moon, MailCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ROUTES } from '../../lib/routes'
import { translateAuthError } from '../../auth/authErrors'
import GoogleButton from '../../auth/GoogleButton'
import './AuthScreen.css'

export default function SignupScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email || !password) {
      setError('יש למלא אימייל וסיסמה.')
      return
    }
    if (password.length < 6) {
      setError('הסיסמה צריכה להיות לפחות 6 תווים.')
      return
    }
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (error) {
      setError(translateAuthError(error.message))
      return
    }
    // If email confirmation is required, there's no session yet → show "check email".
    // If confirmation is off, a session exists and AuthProvider switches the view.
    if (!data.session) setSent(true)
  }

  if (sent) {
    return (
      <div className="auth-wrap">
        <div className="auth-card auth-card-msg">
          <span className="auth-msg-icon"><MailCheck size={34} strokeWidth={1.4} aria-hidden="true" /></span>
          <p className="auth-title">בדוק/י את האימייל</p>
          <p className="auth-sub">שלחנו קישור אישור ל-{email}. אחרי האישור אפשר להתחבר.</p>
          <Link to={ROUTES.LOGIN} className="auth-btn auth-btn-link">חזרה להתחברות</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand"><Moon size={22} strokeWidth={1.6} aria-hidden="true" /><span>Mångata</span></div>
        <p className="auth-title">יצירת חשבון</p>
        <p className="auth-sub">כל מה שצריך כדי להתחיל</p>

        {error && <p className="auth-error">{error}</p>}

        <label className="auth-label" htmlFor="signup-email">אימייל</label>
        <input id="signup-email" className="auth-input" type="email" dir="ltr" autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />

        <label className="auth-label" htmlFor="signup-pass">סיסמה</label>
        <input id="signup-pass" className="auth-input" type="password" dir="ltr" autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)} placeholder="לפחות 6 תווים" />

        <button className="auth-btn" type="submit" disabled={busy}>{busy ? 'יוצר חשבון…' : 'הרשמה'}</button>

        <div className="auth-divider"><span>או</span></div>
        <GoogleButton onError={setError} label="הרשמה עם Google" />

        <p className="auth-foot">כבר יש לך חשבון? <Link to={ROUTES.LOGIN}>התחברות</Link></p>
      </form>
    </div>
  )
}
