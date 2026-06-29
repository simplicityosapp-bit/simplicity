import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, ChevronLeft, ChevronDown, SlidersHorizontal } from 'lucide-react'
import {
  fmtDayLabel, fmtHebrewDayLabel, hebrewMonthLabel, monthNamesLong,
  hebrewMonthsOfYear, hebrewParts, isSameHebrewMonth, stepHebrewMonth,
} from '../../lib/calendar'
import { useT } from '../../i18n/useT'

const VIEW_KEYS = ['schedule', 'day', 'week', 'month']

/* Compact Gregorian date piece, e.g. "24 יוני" — used in dual mode. */
const gregPiece = (d) => `${d.getDate()} ${monthNamesLong()[d.getMonth()]}`

/* The arrow step matches the view: month steps a whole month, week steps
   a week (7 civil days), day + schedule step a day. In Hebrew mode the
   month step follows the Hebrew calendar (Sivan → Tammuz → Av), not the
   Gregorian one; a week is 7 days regardless of calendar. */
function stepDate(view, date, dir, hebrew) {
  const d = new Date(date)
  if (view === 'month') {
    if (hebrew) return stepHebrewMonth(d, dir)
    d.setDate(1) // normalize first so Jan 31 + 1mo → Feb, not Mar
    d.setMonth(d.getMonth() + dir)
  } else if (view === 'week') {
    d.setDate(d.getDate() + dir * 7)
  } else {
    d.setDate(d.getDate() + dir)
  }
  return d
}

/* The month+year picker that sits between the nav arrows in the week and
   month views — click to open a 12-month grid with year stepping. */
function MonthPicker({ date, onPick }) {
  const { t } = useT('calendar')
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(date.getFullYear())
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  /* Sync the picker year to the current date when opening (in the handler,
     not an effect) so external date changes are reflected next open. */
  const toggle = () => {
    if (open) { setOpen(false); return }
    setYear(date.getFullYear())
    setOpen(true)
  }
  const pick = (m) => { onPick(new Date(year, m, 1)); setOpen(false) }

  return (
    <div className="cal-monthpick" ref={ref}>
      <button type="button" className="cal-monthpick-btn" onClick={toggle} aria-expanded={open} aria-haspopup="dialog">
        {monthNamesLong()[date.getMonth()]} {date.getFullYear()}
        <ChevronDown size={14} strokeWidth={1.7} aria-hidden="true" />
      </button>
      {open && (
        <div className="cal-monthpick-panel" role="dialog" aria-label={t('monthPicker.dialogAria')}>
          <div className="cal-monthpick-year">
            <button type="button" onClick={() => setYear((y) => y - 1)} aria-label={t('monthPicker.prevYear')}><ChevronRight size={15} strokeWidth={1.7} aria-hidden="true" /></button>
            <span className="mono">{year}</span>
            <button type="button" onClick={() => setYear((y) => y + 1)} aria-label={t('monthPicker.nextYear')}><ChevronLeft size={15} strokeWidth={1.7} aria-hidden="true" /></button>
          </div>
          <div className="cal-monthpick-grid">
            {monthNamesLong().map((m, i) => {
              const on = i === date.getMonth() && year === date.getFullYear()
              return (
                <button key={m} type="button" className={`cal-monthpick-cell${on ? ' on' : ''}`} onClick={() => pick(i)}>{m}</button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* Hebrew sibling of MonthPicker — the panel lists the actual months of
   the displayed Hebrew year (12, or 13 with אדר א׳/ב׳) and steps by
   Hebrew year. Picking a month jumps to that month's first civil day. */
function HebrewMonthPicker({ date, onPick }) {
  const { t } = useT('calendar')
  const [open, setOpen] = useState(false)
  const [ref, setRef] = useState(date)
  const wrapRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const toggle = () => {
    if (open) { setOpen(false); return }
    setRef(date)
    setOpen(true)
  }
  /* Walking the calendar for a year's months is non-trivial — derive once
     per displayed year, not on every header re-render. */
  const months = useMemo(() => hebrewMonthsOfYear(ref), [ref])
  const yearText = hebrewParts(months[0].date).yearText
  const pick = (mDate) => { onPick(mDate); setOpen(false) }

  return (
    <div className="cal-monthpick" ref={wrapRef}>
      <button type="button" className="cal-monthpick-btn" onClick={toggle} aria-expanded={open} aria-haspopup="dialog">
        {hebrewMonthLabel(date)}
        <ChevronDown size={14} strokeWidth={1.7} aria-hidden="true" />
      </button>
      {open && (
        <div className="cal-monthpick-panel" role="dialog" aria-label={t('monthPicker.dialogAria')}>
          <div className="cal-monthpick-year">
            <button type="button" onClick={() => setRef(stepHebrewMonth(months[0].date, -1))} aria-label={t('monthPicker.prevYear')}><ChevronRight size={15} strokeWidth={1.7} aria-hidden="true" /></button>
            <span>{yearText}</span>
            <button type="button" onClick={() => setRef(stepHebrewMonth(months[months.length - 1].date, +1))} aria-label={t('monthPicker.nextYear')}><ChevronLeft size={15} strokeWidth={1.7} aria-hidden="true" /></button>
          </div>
          <div className="cal-monthpick-grid heb">
            {months.map((mo) => {
              const on = isSameHebrewMonth(mo.date, date)
              return (
                <button key={mo.name} type="button" className={`cal-monthpick-cell${on ? ' on' : ''}`} onClick={() => pick(mo.date)}>{mo.name}</button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* Header strip — view-mode pills + month/day navigation. The "schedule"
   view stays range-less. In week/month the arrows jump whole months and
   the centre is a month picker; in day they step a day and show the date.
   RTL: ChevronRight = "previous" (it points toward the past). */
export default function CalendarHeader({ view, onViewChange, date, onDateChange, onOpenFilter, filterActive, hebrew = false, dual = false }) {
  const { t } = useT('calendar')
  const monthish = view === 'week' || view === 'month'
  const goPrev = () => onDateChange(stepDate(view, date, -1, hebrew))
  const goNext = () => onDateChange(stepDate(view, date, +1, hebrew))
  /* Arrow labels track the step size: month / week / day. */
  const prevLabel = view === 'month' ? t('nav.prevMonth') : view === 'week' ? t('nav.prevWeek') : t('nav.prev')
  const nextLabel = view === 'month' ? t('nav.nextMonth') : view === 'week' ? t('nav.nextWeek') : t('nav.next')
  /* Day-view label: Hebrew (optionally with the Gregorian date alongside
     in dual mode) or plain Gregorian. */
  const dayLabel = hebrew
    ? (dual ? `${fmtHebrewDayLabel(date)} · ${gregPiece(date)}` : fmtHebrewDayLabel(date))
    : fmtDayLabel(date)
  /* In week/month "היום" also drops into the day view of today, so it always
     does something visible (otherwise it's a no-op when already on this month). */
  const goToday = () => { onDateChange(new Date()); if (monthish) onViewChange('day') }

  return (
    <div className="cal-header">
      <div className="cal-view-toggle" role="tablist" aria-label={t('nav.tablistAria')}>
        {VIEW_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`cal-view-btn${view === k ? ' on' : ''}`}
            onClick={() => onViewChange(k)}
            role="tab"
            aria-selected={view === k}
          >
            {t(`views.${k}`)}
          </button>
        ))}
      </div>

      {view !== 'schedule' && (
        <div className="cal-nav">
          <button type="button" className="cal-nav-btn" onClick={goPrev} aria-label={prevLabel}>
            <ChevronRight size={16} strokeWidth={1.6} aria-hidden="true" />
          </button>
          {monthish
            ? (hebrew
                ? <HebrewMonthPicker date={date} onPick={onDateChange} />
                : <MonthPicker date={date} onPick={onDateChange} />)
            : <span className="cal-nav-label">{dayLabel}</span>}
          <button type="button" className="cal-nav-btn" onClick={goNext} aria-label={nextLabel}>
            <ChevronLeft size={16} strokeWidth={1.6} aria-hidden="true" />
          </button>
          <button type="button" className="cal-nav-today" onClick={goToday}>{t('nav.today')}</button>
        </div>
      )}

      {onOpenFilter && (
        <button
          type="button"
          className={`cal-nav-btn cal-filter-btn${filterActive ? ' is-active' : ''}`}
          onClick={onOpenFilter}
          aria-label={t('filter')}
          title={t('filter')}
        >
          <SlidersHorizontal size={16} strokeWidth={1.6} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
