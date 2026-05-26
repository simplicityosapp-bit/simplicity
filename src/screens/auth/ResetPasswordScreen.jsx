import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Moon, MailCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ROUTES } from '../../lib/routes'
import { translateAuthError } from '../../auth/authErrors'
import './AuthScreen.css'

export default function ResetPasswordScreen() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email) {
      setError('יש למלא אימייל.')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${ROUTES.LOGIN}`,
    })
    setBusy(false)
    if (error) setError(translateAuthError(error.message))
    else setSent(true)
  }

  if (sent) {
    return (
      <div className="auth-wrap">
        <div className="auth-card auth-card-msg">
          <span className="auth-msg-icon"><MailCheck size={34} strokeWidth={1.4} aria-hidden="true" /></span>
          <p className="auth-title">קישור איפוס נשלח</p>
          <p className="auth-sub">אם {email} רשום אצלנו — ישלח קישור לאיפוס הסיסמה.</p>
          <Link to={ROUTES.LOGIN} className="auth-btn auth-btn-link">חזרה להתחברות</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand"><Moon size={22} strokeWidth={1.6} aria-hidden="true" /><span>Mångata</span></div>
        <p className="auth-title">איפוס סיסמה</p>
        <p className="auth-sub">נשלח לך קישור לאיפוס</p>

        {error && <p className="auth-error">{error}</p>}

        <label className="auth-label" htmlFor="reset-email">אימייל</label>
        <input id="reset-email" className="auth-input" type="email" dir="ltr" autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />

        <button className="auth-btn" type="submit" disabled={busy}>{busy ? 'שולח…' : 'שליחת קישור'}</button>

        <p className="auth-foot"><Link to={ROUTES.LOGIN}>חזרה להתחברות</Link></p>
      </form>
    </div>
  )
}
