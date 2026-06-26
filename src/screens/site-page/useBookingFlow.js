import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchBookingPageConfig, fetchBookingSlots, submitBooking } from '../../lib/api/bookingIntake'

/* ════════════════════════════════════════════════════════════════
   useBookingFlow — the booking flow (type → day → time → details → done)
   driven entirely by the existing, verified `booking-intake` edge function.
   ════════════════════════════════════════════════════════════════
   Extracted for the page-builder's inline booking block. It is a faithful
   copy of the /book public screen's logic, but headless (no JSX/styling) so
   the block can render the SAME flow in the site-page design. It NEVER touches
   booking_pages/bookings directly — only the edge function — so anti-double-
   booking + calendar + Google write all stay server-side and unchanged.

   `enabled` is false in the editor canvas so it makes NO network calls there. */

const str = (v) => (v == null ? '' : String(v)).trim()

const ymdInTz = (date, tz) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
const addDays = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

export function useBookingFlow(pageId, { enabled = true } = {}) {
  const [status, setStatus] = useState('loading') // loading | ready | notfound | done
  const [config, setConfig] = useState(null)
  const [typeId, setTypeId] = useState(null)
  const [slots, setSlots] = useState(null)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [dayKey, setDayKey] = useState(null)
  const [slot, setSlot] = useState(null)
  const [values, setValues] = useState({ name: '', phone: '', email: '', note: '' })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [thankYou, setThankYou] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const hp = useRef('')

  const tz = config?.availability?.timezone || 'Asia/Jerusalem'
  const types = useMemo(() => (Array.isArray(config?.meetingTypes) ? config.meetingTypes : []), [config])
  const chosenType = useMemo(() => types.find((t) => (t.id ?? '__d') === typeId) || null, [types, typeId])

  /* Load the page config once (or when the referenced page changes). */
  useEffect(() => {
    if (!enabled || !str(pageId)) { setStatus(str(pageId) ? 'loading' : 'notfound'); return }
    let active = true
    setStatus('loading'); setConfig(null); setTypeId(null); setSlots(null)
    setDayKey(null); setSlot(null); setValues({ name: '', phone: '', email: '', note: '' })
    setErrors({}); setSubmitError(null); setThankYou(null); hp.current = ''
    ;(async () => {
      try {
        const cfg = await fetchBookingPageConfig(pageId)
        if (!active) return
        if (!cfg || typeof cfg !== 'object' || !cfg.id || !Array.isArray(cfg.meetingTypes)) { setStatus('notfound'); return }
        setConfig(cfg); setStatus('ready')
        if (cfg.meetingTypes.length === 1) setTypeId(cfg.meetingTypes[0].id ?? '__d')
      } catch { if (active) setStatus('notfound') }
    })()
    return () => { active = false }
  }, [pageId, enabled])

  /* Load slots whenever a meeting type is chosen. */
  useEffect(() => {
    if (!enabled || !config || typeId == null) return
    let active = true
    setSlotsLoading(true); setSlots(null); setDayKey(null); setSlot(null)
    ;(async () => {
      try {
        const from = ymdInTz(new Date(), tz)
        const to = addDays(from, config.availability?.maxDaysAhead || 30)
        const res = await fetchBookingSlots(pageId, chosenType?.id || undefined, from, to)
        if (active) setSlots(Array.isArray(res?.slots) ? res.slots : [])
      } catch { if (active) setSlots([]) } finally { if (active) setSlotsLoading(false) }
    })()
    return () => { active = false }
  }, [config, typeId, pageId, tz, chosenType, refreshKey, enabled])

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

  const submit = async (e) => {
    if (e) e.preventDefault()
    setSubmitError(null)
    const nextErrors = {}
    if (!str(values.name)) nextErrors.name = true
    if (str(values.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) nextErrors.email = true
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return { error: 'validation' } }
    setSubmitting(true)
    try {
      const res = await submitBooking(pageId, {
        meetingTypeId: chosenType?.id || undefined,
        start: slot.start,
        answers: { ...values, _hp: hp.current },
      })
      setThankYou(res?.thankYou || config?.content?.thankYou || null)
      setStatus('done')
      return { ok: true, thankYou: res?.thankYou }
    } catch (e2) {
      const msg = e2?.message || ''
      if (/409|slot_taken/i.test(msg) || e2?.context?.status === 409) {
        setSlot(null); setRefreshKey((k) => k + 1)
        return { error: 'slot_taken' }
      }
      setSubmitError('generic')
      return { error: 'generic' }
    } finally { setSubmitting(false) }
  }

  return {
    status, config, tz, types, typeId, setTypeId, chosenType,
    slots, slotsLoading, days, dayKey, setDayKey, daySlots, slot, setSlot,
    values, setField, errors, submitting, submitError, thankYou, hp, submit,
  }
}
