import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchLeadPageConfig, submitLead } from '../../lib/api/leadIntake'
import { isChoiceType, leadPageSurface, safeRedirectUrl } from '../../lib/leadPageSchema'
import './LeadPage.css'

/* ════════════════════════════════════════════════════════════════
   PUBLIC LEAD PAGE — /lead/<id>, reachable WITHOUT login.
   ════════════════════════════════════════════════════════════════
   Self-contained: no app shell, no auth, no i18n provider. Talks only
   to the `lead-intake` edge function (config + submit). Hebrew/RTL
   chrome; all visible copy beyond the chrome is coach-authored. */

const str = (v) => (v == null ? '' : String(v)).trim()

export default function LeadPage() {
  const { pageId } = useParams()
  const [status, setStatus] = useState('loading') // loading | ready | notfound | done
  const [config, setConfig] = useState(null)
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [thankYou, setThankYou] = useState(null)
  const hp = useRef('') // honeypot

  useEffect(() => {
    let active = true
    // Reset all per-page state so navigating between two /lead/<id> pages (same
    // component instance) never shows the previous page's answers / thank-you.
    setStatus('loading'); setConfig(null); setValues({}); setErrors({})
    setSubmitError(null); setThankYou(null); hp.current = ''
    ;(async () => {
      try {
        const cfg = await fetchLeadPageConfig(pageId)
        if (active) { setConfig(cfg); setStatus('ready') }
      } catch {
        if (active) setStatus('notfound')
      }
    })()
    return () => { active = false }
  }, [pageId])

  const content = config?.content ?? {}
  const fields = useMemo(() => (Array.isArray(config?.fields) ? config.fields : []), [config])

  const setField = (key, v) => {
    setValues((prev) => ({ ...prev, [key]: v }))
    setErrors((prev) => (prev[key] ? { ...prev, [key]: false } : prev))
  }
  /* Multi-select (checkbox): toggle an option in the value array. */
  const toggleChoice = (key, opt) => {
    setValues((prev) => {
      const arr = Array.isArray(prev[key]) ? prev[key] : []
      return { ...prev, [key]: arr.includes(opt) ? arr.filter((o) => o !== opt) : [...arr, opt] }
    })
    setErrors((prev) => (prev[key] ? { ...prev, [key]: false } : prev))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError(null)
    // Client-side required check (the server re-validates authoritatively).
    const isEmpty = (f) => (f.type === 'checkbox'
      ? !(Array.isArray(values[f.key]) && values[f.key].length)
      : !str(values[f.key]))
    const nextErrors = {}
    fields.forEach((f) => { if (f.required && isEmpty(f)) nextErrors[f.key] = true })
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return }

    // Flatten answers to strings (multi-select arrays → comma-joined).
    const answers = { _hp: hp.current }
    fields.forEach((f) => {
      const v = values[f.key]
      answers[f.key] = f.type === 'checkbox' ? (Array.isArray(v) ? v.join(', ') : '') : (v ?? '')
    })

    setSubmitting(true)
    try {
      const res = await submitLead(pageId, answers)
      const ty = res?.thankYou || content.thankYou || null
      const redirect = ty?.mode === 'redirect' ? safeRedirectUrl(ty.url) : null
      if (redirect) {
        window.location.href = redirect
        return
      }
      setThankYou(ty)
      setStatus('done')
    } catch {
      setSubmitError('אירעה שגיאה בשליחה. נסו שוב בעוד רגע.')
    } finally {
      setSubmitting(false)
    }
  }

  const { style: rootStyle, cls: surfaceCls } = leadPageSurface(content)
  const rootClass = `lp-root lp-surface${surfaceCls ? ` ${surfaceCls}` : ''}`

  if (status === 'loading') {
    return (
      <div className={rootClass} dir="rtl" style={rootStyle}>
        <div className="lp-card lp-state"><p className="lp-muted">טוען…</p></div>
      </div>
    )
  }

  if (status === 'notfound') {
    return (
      <div className={rootClass} dir="rtl" style={rootStyle}>
        <div className="lp-card lp-state">
          <h1 className="lp-heading">הדף לא נמצא</h1>
          <p className="lp-muted">ייתכן שהקישור שגוי או שהדף אינו פעיל יותר.</p>
        </div>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className={rootClass} dir="rtl" style={rootStyle}>
        <div className="lp-card lp-state">
          {content.logoText ? <div className="lp-logo">{content.logoText}</div> : null}
          <div className="lp-check" aria-hidden="true">✓</div>
          <p className="lp-thankyou">{str(thankYou?.message) || 'תודה! קיבלנו את הפנייה ונחזור אליך בהקדם.'}</p>
          {str(content.bookingPageRef) ? (
            <a className="lp-book-cta" href={`/book/${content.bookingPageRef}`}>קביעת פגישה</a>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className={rootClass} dir="rtl" style={rootStyle}>
      <form className="lp-card" onSubmit={handleSubmit} noValidate>
        {content.logoText ? <div className="lp-logo">{content.logoText}</div> : null}
        {content.heading ? <h1 className="lp-heading">{content.heading}</h1> : null}
        {content.body ? <p className="lp-body">{content.body}</p> : null}

        <div className="lp-fields">
          {fields.map((f) => {
            const labelNode = (
              <span className="lp-label">
                {f.label || f.key}
                {f.required ? <span className="lp-req" aria-hidden="true"> *</span> : null}
              </span>
            )
            if (isChoiceType(f.type)) {
              return (
                <div key={f.key} className="lp-field" role="group" aria-label={f.label || f.key}>
                  {labelNode}
                  <div className={`lp-choices${errors[f.key] ? ' is-error' : ''}`}>
                    {(f.options || []).map((opt, oi) => (
                      <label className="lp-choice" key={oi}>
                        <input
                          type={f.type === 'select' ? 'radio' : 'checkbox'}
                          name={f.key}
                          checked={f.type === 'select'
                            ? values[f.key] === opt
                            : (Array.isArray(values[f.key]) && values[f.key].includes(opt))}
                          onChange={() => (f.type === 'select' ? setField(f.key, opt) : toggleChoice(f.key, opt))}
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                  {errors[f.key] ? <span className="lp-field-error">שדה חובה</span> : null}
                </div>
              )
            }
            return (
              <label key={f.key} className="lp-field">
                {labelNode}
                {f.type === 'textarea' ? (
                  <textarea
                    className={`lp-input lp-textarea${errors[f.key] ? ' is-error' : ''}`}
                    value={values[f.key] ?? ''}
                    onChange={(e) => setField(f.key, e.target.value)}
                    rows={4}
                    required={!!f.required}
                  />
                ) : (
                  <input
                    className={`lp-input${errors[f.key] ? ' is-error' : ''}`}
                    type={f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'}
                    value={values[f.key] ?? ''}
                    onChange={(e) => setField(f.key, e.target.value)}
                    required={!!f.required}
                  />
                )}
                {errors[f.key] ? <span className="lp-field-error">שדה חובה</span> : null}
              </label>
            )
          })}
        </div>

        {/* Honeypot — visually hidden; bots fill it, humans don't. */}
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          className="lp-hp"
          aria-hidden="true"
          onChange={(e) => { hp.current = e.target.value }}
        />

        {submitError ? <p className="lp-submit-error">{submitError}</p> : null}

        <button type="submit" className="lp-submit" disabled={submitting}>
          {submitting ? 'שולח…' : 'שליחה'}
        </button>

        {/* Optional CTA to the coach's booking page (attached at the foot). */}
        {str(content.bookingPageRef) ? (
          <a className="lp-book-cta" href={`/book/${content.bookingPageRef}`}>קביעת פגישה</a>
        ) : null}
      </form>
    </div>
  )
}
