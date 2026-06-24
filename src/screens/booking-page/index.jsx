import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchBookingPageConfig, fetchBookingSlots, submitBooking } from '../../lib/api/bookingIntake'
import { leadPageSurface, safeRedirectUrl } from '../../lib/bookingPageSchema'
import '../lead-page/LeadPage.css' // shared surface + card + inputs (lp-*)
import './BookingPage.css'         // booking-specific step flow (bk2-*)

/* ════════════════════════════════════════════════════════════════
   PUBLIC BOOKING PAGE — /book/<id>, reachable WITHOUT login.
   ════════════════════════════════════════════════════════════════
   Self-contained: no app shell, no auth. Talks only to the
   `booking-intake` edge function (config + slots + submit). Hebrew/RTL;
   all visible copy beyond the chrome is coach-authored.

   Flow: choose meeting type → choose day → choose time → details → done. */

const str = (v) => (v == null ? '' : String(v)).trim()

/* ── tz-aware date helpers (display only; the edge owns slot math) ──── */
const ymdInTz = (date, tz) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
const fmtTime = (iso, tz) =>
  new Intl.DateTimeFormat('he-IL', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
const fmtDayLabel = (iso, tz) =>
  new Intl.DateTimeFormat('he-IL', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso))

const addDays = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

export default function BookingPage() {
  const { pageId } = useParams()
  const [status, setStatus] = useState('loading') // loading | ready | notfound | done
  const [config, setConfig] = useState(null)
  const [typeId, setTypeId] = useState(null)
  const [slots, setSlots] = useState(null)        // null = not loaded, [] = none
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [dayKey, setDayKey] = useState(null)
  const [slot, setSlot] = useState(null)          // chosen { start, end }
  const [values, setValues] = useState({ name: '', phone: '', email: '', note: '' })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [thankYou, setThankYou] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0) // bumped to re-fetch slots after a 409 race
  const hp = useRef('')

  const content = config?.content ?? {}
  const tz = config?.availability?.timezone || 'Asia/Jerusalem'
  const types = useMemo(() => (Array.isArray(config?.meetingTypes) ? config.meetingTypes : []), [config])
  const chosenType = useMemo(() => types.find((t) => (t.id ?? '__d') === typeId) || null, [types, typeId])

  useEffect(() => {
    let active = true
    // Reset all per-page state so navigating between two /book/<id> pages (same
    // component instance) never carries over the previous page's selections.
    setStatus('loading'); setConfig(null); setTypeId(null); setSlots(null)
    setDayKey(null); setSlot(null); setValues({ name: '', phone: '', email: '', note: '' })
    setErrors({}); setSubmitError(null); setThankYou(null); hp.current = ''
    ;(async () => {
      try {
        const cfg = await fetchBookingPageConfig(pageId)
        if (!active) return
        // A valid config always carries an id + a meetingTypes array. Anything
        // else (missing/malformed) is treated as not-found rather than an
        // empty card.
        if (!cfg || typeof cfg !== 'object' || !cfg.id || !Array.isArray(cfg.meetingTypes)) {
          setStatus('notfound'); return
        }
        setConfig(cfg)
        setStatus('ready')
        // Auto-select when the page offers a single type.
        if (cfg.meetingTypes.length === 1) {
          setTypeId(cfg.meetingTypes[0].id ?? '__d')
        }
      } catch {
        if (active) setStatus('notfound')
      }
    })()
    return () => { active = false }
  }, [pageId])

  /* Load slots whenever a meeting type is chosen. */
  useEffect(() => {
    if (!config || typeId == null) return
    let active = true
    setSlotsLoading(true); setSlots(null); setDayKey(null); setSlot(null)
    ;(async () => {
      try {
        const from = ymdInTz(new Date(), tz)
        const to = addDays(from, config.availability?.maxDaysAhead || 30)
        const realId = chosenType?.id || undefined
        const res = await fetchBookingSlots(pageId, realId, from, to)
        if (active) setSlots(Array.isArray(res?.slots) ? res.slots : [])
      } catch {
        if (active) setSlots([])
      } finally {
        if (active) setSlotsLoading(false)
      }
    })()
    return () => { active = false }
  }, [config, typeId, pageId, tz, chosenType, refreshKey])

  /* Group slots by local day. */
  const days = useMemo(() => {
    if (!slots) return []
    const map = new Map()
    for (const s of slots) {
      const k = ymdInTz(new Date(s.start), tz)
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(s)
    }
    return Array.from(map.entries()).map(([key, list]) => ({ key, list }))
  }, [slots, tz])

  const daySlots = useMemo(() => days.find((d) => d.key === dayKey)?.list ?? [], [days, dayKey])

  const setField = (key, v) => {
    setValues((prev) => ({ ...prev, [key]: v }))
    setErrors((prev) => (prev[key] ? { ...prev, [key]: false } : prev))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError(null)
    // The form is noValidate, so type="email" isn't enforced — validate here.
    const nextErrors = {}
    if (!str(values.name)) nextErrors.name = true
    if (str(values.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) nextErrors.email = true
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return }
    setSubmitting(true)
    try {
      const res = await submitBooking(pageId, {
        meetingTypeId: chosenType?.id || undefined,
        start: slot.start,
        answers: { ...values, _hp: hp.current },
      })
      const ty = res?.thankYou || content.thankYou || null
      const redirect = ty?.mode === 'redirect' ? safeRedirectUrl(ty.url) : null
      if (redirect) { window.location.href = redirect; return }
      setThankYou(ty)
      setStatus('done')
    } catch (e2) {
      // 409 → the slot was taken between listing and submit.
      const msg = e2?.message || ''
      if (/409|slot_taken/i.test(msg) || e2?.context?.status === 409) {
        setSubmitError('המועד נתפס הרגע. בחרו מועד אחר.')
        setSlot(null)
        setRefreshKey((k) => k + 1) // re-fetch slots so the taken one drops off
      } else {
        setSubmitError('אירעה שגיאה בקביעת הפגישה. נסו שוב בעוד רגע.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const { style: rootStyle, cls: surfaceCls } = leadPageSurface(content)
  const rootClass = `lp-root lp-surface bk2-page${surfaceCls ? ` ${surfaceCls}` : ''}`

  if (status === 'loading') {
    return <div className={rootClass} dir="rtl" style={rootStyle}><div className="lp-card lp-state"><p className="lp-muted">טוען…</p></div></div>
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
          <p className="lp-thankyou">{str(thankYou?.message) || 'תודה! הפגישה נקבעה.'}</p>
          {slot ? <p className="bk2-confirm-when">{fmtDayLabel(slot.start, tz)} · {fmtTime(slot.start, tz)}</p> : null}
        </div>
      </div>
    )
  }

  return (
    <div className={rootClass} dir="rtl" style={rootStyle}>
      <div className="lp-card">
        {content.logoText ? <div className="lp-logo">{content.logoText}</div> : null}
        {content.heading ? <h1 className="lp-heading">{content.heading}</h1> : null}
        {content.body ? <p className="lp-body">{content.body}</p> : null}

        {/* Step 1 — meeting type */}
        {types.length > 1 && (
          <div className="bk2-section">
            <p className="bk2-step-label">בחירת סוג פגישה</p>
            <div className="bk2-types">
              {types.map((t) => {
                const id = t.id ?? '__d'
                return (
                  <button
                    key={id}
                    type="button"
                    className={`bk2-type${typeId === id ? ' on' : ''}`}
                    onClick={() => setTypeId(id)}
                  >
                    <span className="bk2-type-name">{t.name}</span>
                    <span className="bk2-type-meta">{t.duration_minutes} דק׳{t.default_price ? ` · ₪${t.default_price}` : ''}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Step 2 — day + time */}
        {typeId != null && (
          <div className="bk2-section">
            <p className="bk2-step-label">בחירת מועד</p>
            {slotsLoading ? (
              <p className="lp-muted">טוען מועדים…</p>
            ) : days.length === 0 ? (
              <p className="lp-muted">אין מועדים פנויים כרגע. נסו שוב מאוחר יותר.</p>
            ) : (
              <>
                <div className="bk2-days">
                  {days.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      className={`bk2-day${dayKey === d.key ? ' on' : ''}`}
                      onClick={() => { setDayKey(d.key); setSlot(null) }}
                    >
                      {fmtDayLabel(d.list[0].start, tz)}
                    </button>
                  ))}
                </div>
                {dayKey && (
                  <div className="bk2-slots">
                    {daySlots.map((s) => (
                      <button
                        key={s.start}
                        type="button"
                        className={`bk2-slot${slot?.start === s.start ? ' on' : ''}`}
                        onClick={() => setSlot(s)}
                      >
                        {fmtTime(s.start, tz)}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 3 — details */}
        {slot && (
          <form className="bk2-section bk2-form" onSubmit={handleSubmit} noValidate>
            <p className="bk2-step-label">הפרטים שלך</p>
            <p className="bk2-chosen">
              {chosenType?.name ? `${chosenType.name} · ` : ''}{fmtDayLabel(slot.start, tz)} · {fmtTime(slot.start, tz)}
            </p>
            <div className="lp-fields">
              <label className="lp-field">
                <span className="lp-label">שם<span className="lp-req" aria-hidden="true"> *</span></span>
                <input className={`lp-input${errors.name ? ' is-error' : ''}`} value={values.name} onChange={(e) => setField('name', e.target.value)} required />
                {errors.name ? <span className="lp-field-error">שדה חובה</span> : null}
              </label>
              <label className="lp-field">
                <span className="lp-label">טלפון</span>
                <input className="lp-input" type="tel" value={values.phone} onChange={(e) => setField('phone', e.target.value)} />
              </label>
              <label className="lp-field">
                <span className="lp-label">אימייל</span>
                <input className={`lp-input${errors.email ? ' is-error' : ''}`} type="email" value={values.email} onChange={(e) => setField('email', e.target.value)} />
                {errors.email ? <span className="lp-field-error">כתובת אימייל לא תקינה</span> : null}
              </label>
              <label className="lp-field">
                <span className="lp-label">הערה</span>
                <textarea className="lp-input lp-textarea" rows={3} value={values.note} onChange={(e) => setField('note', e.target.value)} />
              </label>
            </div>

            <input type="text" tabIndex={-1} autoComplete="off" className="lp-hp" aria-hidden="true" onChange={(e) => { hp.current = e.target.value }} />
            {submitError ? <p className="lp-submit-error">{submitError}</p> : null}
            <button type="submit" className="lp-submit" disabled={submitting}>
              {submitting ? 'קובע…' : 'קביעת הפגישה'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
