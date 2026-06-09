import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, MailCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ROUTES } from '../../lib/routes'
import { translateAuthError } from '../../auth/authErrors'
import GoogleButton from '../../auth/GoogleButton'
import { useAddress } from '../../hooks/useAddress'
import './AuthScreen.css'

export default function SignupScreen() {
  const { addr } = useAddress()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
    if (!data.session) setSent(true)
  }

  if (sent) {
    return (
      <div className="auth-wrap">
        <div className="auth-bg" aria-hidden="true" />
        <div className="auth-stage">
          <div className="auth-brand">
            <img className="auth-logo light" src="/logo-dark.png" alt="" aria-hidden="true" />
            <img className="auth-logo dark"  src="/logo-light.png" alt="" aria-hidden="true" />
            <img className="auth-name light" src="/name-dark.png" alt="simplicity" />
            <img className="auth-name dark"  src="/name-light.png" alt="simplicity" />
          </div>
          <div className="auth-form auth-msg-card">
            <span className="auth-msg-icon"><MailCheck size={34} strokeWidth={1.4} aria-hidden="true" /></span>
            <p className="auth-title">{addr({male:'בדוק',female:'בדקי',neutral:'בדוק/י'})} את האימייל</p>
            <p className="auth-sub">שלחנו קישור אישור ל-{email}. אחרי האישור אפשר להתחבר.</p>
            <Link to={ROUTES.LOGIN} className="auth-btn auth-btn-primary">חזרה להתחברות</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-wrap">
      <div className="auth-bg" aria-hidden="true" />
      <div className="auth-stage">
        <div className="auth-brand">
          <img className="auth-logo light" src="/logo-dark.png" alt="" aria-hidden="true" />
          <img className="auth-logo dark"  src="/logo-light.png" alt="" aria-hidden="true" />
          <img className="auth-name light" src="/name-dark.png" alt="simplicity" />
          <img className="auth-name dark"  src="/name-light.png" alt="simplicity" />
        </div>

        <form className="auth-form" onSubmit={submit}>
          {error && <p className="auth-error">{error}</p>}

          <label className="auth-field" htmlFor="signup-email">
            <span className="auth-field-icon"><Mail size={16} strokeWidth={1.6} aria-hidden="true" /></span>
            <input
              id="signup-email"
              type="email"
              dir="ltr"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
            />
          </label>

          <label className="auth-field" htmlFor="signup-pass">
            <span className="auth-field-icon"><Lock size={16} strokeWidth={1.6} aria-hidden="true" /></span>
            <input
              id="signup-pass"
              type={showPassword ? 'text' : 'password'}
              dir="ltr"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="לפחות 6 תווים"
            />
            <button
              type="button"
              className="auth-field-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
            >
              {showPassword
                ? <EyeOff size={16} strokeWidth={1.6} aria-hidden="true" />
                : <Eye size={16} strokeWidth={1.6} aria-hidden="true" />}
            </button>
          </label>

          <button className="auth-btn auth-btn-primary" type="submit" disabled={busy}>
            {busy ? 'יוצר חשבון…' : 'הרשמה'}
          </button>

          <div className="auth-divider"><span>או</span></div>

          <GoogleButton onError={setError} label="הרשמה עם Google" />
        </form>

        <p className="auth-foot">כבר יש לך חשבון? <Link to={ROUTES.LOGIN} className="auth-foot-cta">התחברות</Link></p>
      </div>
    </div>
  )
}
