import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, MailCheck, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ROUTES } from '../../lib/routes'
import { translateAuthError } from '../../auth/authErrors'
import GoogleButton from '../../auth/GoogleButton'
import { useAddress } from '../../hooks/useAddress'
import { buildConsent, stashPendingConsent } from '../../lib/legal'
import PrivacyPolicyModal from '../../components/legal/PrivacyPolicyModal'
import DPAModal from '../../components/legal/DPAModal'
import './AuthScreen.css'

export default function SignupScreen() {
  const { addr } = useAddress()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [agreeDpa, setAgreeDpa] = useState(false)
  const [agreeMarketing, setAgreeMarketing] = useState(false)
  const [legalModal, setLegalModal] = useState(null) // 'privacy' | 'dpa' | null
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  /* Both legal documents must be accepted before any signup path. */
  const canConsent = agreePrivacy && agreeDpa

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
    if (!canConsent) {
      setError('יש לאשר את מדיניות הפרטיות ואת הסכם עיבוד הנתונים.')
      return
    }
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: buildConsent({ marketing: agreeMarketing }) },
    })
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
            <label className="auth-check">
              <input type="checkbox" checked={agreeMarketing} onChange={(e) => setAgreeMarketing(e.target.checked)} />
              <span className="auth-check-box" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>
              <span className="auth-check-label">
                אני מסכים/ה שסימפליסיטי תשתמש באימייל שלי ליצירת קהלי פרסום (ניתן לביטול בכל עת)
              </span>
            </label>
          </div>

          <button className="auth-btn auth-btn-primary" type="submit" disabled={busy || !canConsent}>
            {busy ? 'יוצר חשבון…' : 'הרשמה'}
          </button>

          <div className="auth-divider"><span>או</span></div>

          <GoogleButton
            onError={setError}
            label="הרשמה עם Google"
            disabled={!canConsent}
            onBeforeAuth={() => stashPendingConsent(buildConsent({ marketing: agreeMarketing }))}
          />
        </form>

        <p className="auth-foot">כבר יש לך חשבון? <Link to={ROUTES.LOGIN} className="auth-foot-cta">התחברות</Link></p>
      </div>

      {legalModal === 'privacy' && <PrivacyPolicyModal onClose={() => setLegalModal(null)} />}
      {legalModal === 'dpa' && <DPAModal onClose={() => setLegalModal(null)} />}
    </div>
  )
}
