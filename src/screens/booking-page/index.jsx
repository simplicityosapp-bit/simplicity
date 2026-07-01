import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchBookingPageConfig, fetchBookingSlots, submitBooking } from '../../lib/api/bookingIntake'
import { leadPageSurface, safeRedirectUrl } from '../../lib/bookingPageSchema'
import { Box, Txt, Btn, Input, Textarea, Lnk } from '../../components/ui'
import { useT } from '../../i18n/useT'
import '../booking-pages/bookingI18n'      // self-registers the 'booking' namespace
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
  const { t } = useT('booking')
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
  const [paymentResult, setPaymentResult] = useState(null) // 'paid' | 'cancelled' — set on return from Grow
  const hp = useRef('')

  const content = config?.content ?? {}
  const tz = config?.availability?.timezone || 'Asia/Jerusalem'
  const types = useMemo(() => (Array.isArray(config?.meetingTypes) ? config.meetingTypes : []), [config])
  const chosenType = useMemo(() => types.find((t) => (t.id ?? '__d') === typeId) || null, [types, typeId])
  // Payment is required when the page opted in AND the chosen type has a price.
  const needsPay = !!config?.requirePayment && Number(chosenType?.default_price) > 0

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

  /* Returning from a Grow payment lands back here as ?paid=1 or ?cancelled=1
     (the successUrl/cancelUrl we passed). Read once on mount. */
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search)
      if (p.get('paid')) setPaymentResult('paid')
      else if (p.get('cancelled')) setPaymentResult('cancelled')
    } catch { /* ignore */ }
  }, [])

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
        origin: typeof window !== 'undefined' ? window.location.origin : undefined,
      })
      // Payment-required booking → Grow returns a hosted-payment URL; send the
      // visitor there to pay (their slot is held meanwhile). On return they land
      // back here with ?paid=1 / ?cancelled=1 (handled on mount).
      if (res?.payment?.url) { window.location.href = res.payment.url; return }
      const ty = res?.thankYou || content.thankYou || null
      const redirect = ty?.mode === 'redirect' ? safeRedirectUrl(ty.url) : null
      if (redirect) { window.location.href = redirect; return }
      setThankYou(ty)
      setStatus('done')
    } catch (e2) {
      // 409 → the slot was taken between listing and submit.
      const msg = e2?.message || ''
      if (/409|slot_taken/i.test(msg) || e2?.context?.status === 409) {
        setSubmitError(t('publicPage.errSlotTaken'))
        setSlot(null)
        setRefreshKey((k) => k + 1) // re-fetch slots so the taken one drops off
      } else {
        setSubmitError(t('publicPage.errGeneric'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const { style: rootStyle, cls: surfaceCls } = leadPageSurface(content)
  const rootClass = `lp-root lp-surface bk2-page${surfaceCls ? ` ${surfaceCls}` : ''}`

  /* Returned from Grow paid → confirm; cancelled → let them try again. These
     short-circuit the normal flow regardless of the config-load status. */
  if (paymentResult === 'paid') {
    return (
      <Box className={rootClass} dir="rtl" style={rootStyle}>
        <Box className="lp-card lp-state">
          {content.logoText ? <Box className="lp-logo">{content.logoText}</Box> : null}
          <Box className="lp-check" aria-hidden="true">✓</Box>
          <Txt as="p" className="lp-thankyou">{t('publicPage.paidThankYou')}</Txt>
        </Box>
      </Box>
    )
  }
  if (paymentResult === 'cancelled') {
    return (
      <Box className={rootClass} dir="rtl" style={rootStyle}>
        <Box className="lp-card lp-state">
          {content.logoText ? <Box className="lp-logo">{content.logoText}</Box> : null}
          <Txt as="h1" className="lp-heading">{t('publicPage.cancelledTitle')}</Txt>
          <Txt as="p" className="lp-muted">{t('publicPage.cancelledBody')}</Txt>
          <Lnk className="lp-submit" href={typeof window !== 'undefined' ? window.location.pathname : '#'}>{t('publicPage.cancelledRetry')}</Lnk>
        </Box>
      </Box>
    )
  }

  if (status === 'loading') {
    return <Box className={rootClass} dir="rtl" style={rootStyle}><Box className="lp-card lp-state"><Txt as="p" className="lp-muted">{t('publicPage.loading')}</Txt></Box></Box>
  }
  if (status === 'notfound') {
    return (
      <Box className={rootClass} dir="rtl" style={rootStyle}>
        <Box className="lp-card lp-state">
          <Txt as="h1" className="lp-heading">{t('publicPage.notFoundTitle')}</Txt>
          <Txt as="p" className="lp-muted">{t('publicPage.notFoundBody')}</Txt>
        </Box>
      </Box>
    )
  }
  if (status === 'done') {
    return (
      <Box className={rootClass} dir="rtl" style={rootStyle}>
        <Box className="lp-card lp-state">
          {content.logoText ? <Box className="lp-logo">{content.logoText}</Box> : null}
          <Box className="lp-check" aria-hidden="true">✓</Box>
          <Txt as="p" className="lp-thankyou">{str(thankYou?.message) || t('publicPage.thankYouDefault')}</Txt>
          {slot ? <Txt as="p" className="bk2-confirm-when">{fmtDayLabel(slot.start, tz)} · {fmtTime(slot.start, tz)}</Txt> : null}
        </Box>
      </Box>
    )
  }

  return (
    <Box className={rootClass} dir="rtl" style={rootStyle}>
      <Box className="lp-card">
        {content.logoText ? <Box className="lp-logo">{content.logoText}</Box> : null}
        {content.heading ? <Txt as="h1" className="lp-heading">{content.heading}</Txt> : null}
        {content.body ? <Txt as="p" className="lp-body">{content.body}</Txt> : null}

        {/* Step 1 — meeting type */}
        {types.length > 1 && (
          <Box className="bk2-section">
            <Txt as="p" className="bk2-step-label">{t('publicPage.stepType')}</Txt>
            <Box className="bk2-types">
              {types.map((mt) => {
                const id = mt.id ?? '__d'
                return (
                  <Btn
                    key={id}
                    className={`bk2-type${typeId === id ? ' on' : ''}`}
                    onClick={() => setTypeId(id)}
                  >
                    <Txt className="bk2-type-name">{mt.name}</Txt>
                    <Txt className="bk2-type-meta">{t('minutes', { count: mt.duration_minutes })}{mt.default_price ? ` · ₪${mt.default_price}` : ''}</Txt>
                  </Btn>
                )
              })}
            </Box>
          </Box>
        )}

        {/* Step 2 — day + time */}
        {typeId != null && (
          <Box className="bk2-section">
            <Txt as="p" className="bk2-step-label">{t('publicPage.stepWhen')}</Txt>
            {slotsLoading ? (
              <Txt as="p" className="lp-muted">{t('publicPage.slotsLoading')}</Txt>
            ) : days.length === 0 ? (
              <Txt as="p" className="lp-muted">{t('publicPage.noSlots')}</Txt>
            ) : (
              <>
                <Box className="bk2-days">
                  {days.map((d) => (
                    <Btn
                      key={d.key}
                      className={`bk2-day${dayKey === d.key ? ' on' : ''}`}
                      onClick={() => { setDayKey(d.key); setSlot(null) }}
                    >
                      {fmtDayLabel(d.list[0].start, tz)}
                    </Btn>
                  ))}
                </Box>
                {dayKey && (
                  <Box className="bk2-slots">
                    {daySlots.map((s) => (
                      <Btn
                        key={s.start}
                        className={`bk2-slot${slot?.start === s.start ? ' on' : ''}`}
                        onClick={() => setSlot(s)}
                      >
                        {fmtTime(s.start, tz)}
                      </Btn>
                    ))}
                  </Box>
                )}
              </>
            )}
          </Box>
        )}

        {/* Step 3 — details */}
        {slot && (
          <Box as="form" className="bk2-section bk2-form" onSubmit={handleSubmit} noValidate>
            <Txt as="p" className="bk2-step-label">{t('publicPage.stepDetails')}</Txt>
            <Txt as="p" className="bk2-chosen">
              {chosenType?.name ? `${chosenType.name} · ` : ''}{fmtDayLabel(slot.start, tz)} · {fmtTime(slot.start, tz)}
            </Txt>
            {needsPay ? <Txt as="p" className="bk2-pay-note">{t('publicPage.payNote', { amount: chosenType.default_price })}</Txt> : null}
            <Box className="lp-fields">
              <Box as="label" className="lp-field">
                <Txt className="lp-label">{t('publicPage.fieldName')}<Txt className="lp-req" aria-hidden="true"> *</Txt></Txt>
                <Input className={`lp-input${errors.name ? ' is-error' : ''}`} value={values.name} onChange={(e) => setField('name', e.target.value)} required />
                {errors.name ? <Txt className="lp-field-error">{t('publicPage.requiredField')}</Txt> : null}
              </Box>
              <Box as="label" className="lp-field">
                <Txt className="lp-label">{t('publicPage.fieldPhone')}</Txt>
                <Input className="lp-input" type="tel" value={values.phone} onChange={(e) => setField('phone', e.target.value)} />
              </Box>
              <Box as="label" className="lp-field">
                <Txt className="lp-label">{t('publicPage.fieldEmail')}</Txt>
                <Input className={`lp-input${errors.email ? ' is-error' : ''}`} type="email" value={values.email} onChange={(e) => setField('email', e.target.value)} />
                {errors.email ? <Txt className="lp-field-error">{t('publicPage.invalidEmail')}</Txt> : null}
              </Box>
              <Box as="label" className="lp-field">
                <Txt className="lp-label">{t('publicPage.fieldNote')}</Txt>
                <Textarea className="lp-input lp-textarea" rows={3} value={values.note} onChange={(e) => setField('note', e.target.value)} />
              </Box>
            </Box>

            <Input type="text" tabIndex={-1} autoComplete="off" className="lp-hp" aria-hidden="true" onChange={(e) => { hp.current = e.target.value }} />
            {submitError ? <Txt as="p" className="lp-submit-error">{submitError}</Txt> : null}
            <Btn type="submit" className="lp-submit" disabled={submitting}>
              {submitting ? t('publicPage.submitting') : (needsPay ? t('publicPage.submitPay') : t('publicPage.submit'))}
            </Btn>
          </Box>
        )}
      </Box>
    </Box>
  )
}
