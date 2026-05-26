import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Moon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ROUTES } from '../../lib/routes'
import { translateAuthError } from '../../auth/authErrors'
import GoogleButton from '../../auth/GoogleButton'
import './AuthScreen.css'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email || !password) {
      setError('יש למלא אימייל וסיסמה.')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError(translateAuthError(error.message))
    // On success the AuthProvider switches the app to the authenticated view.
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand"><Moon size={22} strokeWidth={1.6} aria-hidden="true" /><span>Simplicity</span></div>
        <p className="auth-title">ברוך/ה הבא/ה</p>
        <p className="auth-sub">התחבר/י כדי להמשיך</p>

        {error && <p className="auth-error">{error}</p>}

        <label className="auth-label" htmlFor="login-email">אימייל</label>
        <input id="login-email" className="auth-input" type="email" dir="ltr" autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />

        <label className="auth-label" htmlFor="login-pass">סיסמה</label>
        <input id="login-pass" className="auth-input" type="password" dir="ltr" autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />

        <Link to={ROUTES.RESET_PASSWORD} className="auth-link-sm">שכחת סיסמה?</Link>

        <button className="auth-btn" type="submit" disabled={busy}>{busy ? 'מתחבר…' : 'התחברות'}</button>

        <div className="auth-divider"><span>או</span></div>
        <GoogleButton onError={setError} />

        <p className="auth-foot">אין לך חשבון? <Link to={ROUTES.SIGNUP}>הרשמה</Link></p>
      </form>
    </div>
  )
}
