import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft } from 'lucide-react'
import {
  monthGrid, monthNamesLong, weekdayNamesShort, isSameDay, weekStartIndex,
  hebrewMonthGrid, hebrewParts, hebrewMonthLabel, stepHebrewMonth, stepHebrewYear,
} from '../lib/calendar'
import { fmtDateInput } from '../lib/dates'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { useT } from '../i18n/useT'
import './DateField.css'
import { Box, Txt, Btn } from './ui'

/* Drop-in replacement for <input type="date">. The native picker displays
   in the BROWSER's UI language (e.g. MM/DD for English Chrome) and ignores
   our date_format pref — so we render our own popup calendar that respects
   the pref + the week-start setting. Same contract as the input: `value`
   is a 'YYYY-MM-DD' string, onChange(nextValue) gets the same. */
const pad = (n) => String(n).padStart(2, '0')
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (v) => {
  if (!v) return null
  const d = new Date(typeof v === 'string' && v.length <= 10 ? `${v}T00:00:00` : v)
  return Number.isNaN(d.getTime()) ? null : d
}

/* Edges (viewport coords) of the nearest ancestor that CLIPS overflow — a
   scroll container or an overflow:hidden box. The popup is positioned inside
   .datefield, so this ancestor is what would cut it off (e.g. the review
   wizard's scrolling body). Falls back to the viewport. */
const clipEdges = (el) => {
  let node = el?.parentElement
  while (node && node !== document.documentElement) {
    const oy = getComputedStyle(node).overflowY
    if (oy === 'auto' || oy === 'scroll' || oy === 'hidden') {
      const r = node.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom }
    }
    node = node.parentElement
  }
  return { top: 0, bottom: window.innerHeight }
}
const POPUP_H = 330 /* approx calendar height — enough to choose a side */

export default function DateField({ value, onChange, className = '', disabled = false, placeholder }) {
  const { t, lang } = useT('components')
  const ph = placeholder ?? t('dateField.placeholder')
  const { prefs } = useUserPreferences()
  const weekStart = prefs?.format?.week_start || 'sunday'
  /* Hebrew date-INPUT mode (Settings → Appearance, independent of the display
     mode). Output stays a Gregorian YYYY-MM-DD — only the picker UI changes. */
  const hebrew = !!prefs?.design?.hebrew_date_input
  const dual = !!prefs?.design?.hebrew_calendar_dual
  const selected = parse(value)
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState('bottom')
  const [view, setView] = useState(() => selected || new Date())
  const ref = useRef(null)

  /* Jump the calendar to the selected month when opening (no effect — the
     sync happens in the toggle handler to avoid setState-in-render). */
  const toggleOpen = () => {
    if (!open) {
      const s = parse(value); if (s) setView(s)
      /* Open upward when there isn't room below but there is more above —
         so the calendar never gets clipped by a scroll container (e.g. a
         row low in the review wizard's list). */
      const r = ref.current?.getBoundingClientRect()
      if (r) {
        const { top, bottom } = clipEdges(ref.current)
        const below = bottom - r.bottom
        const above = r.top - top
        setPlacement(below < POPUP_H && above > below ? 'top' : 'bottom')
      }
    }
    setOpen((o) => !o)
  }
  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  /* Enriched cells — gematria day + in-month flag derived once per view in
     Hebrew mode (the reference month is read a single time). */
  const cells = useMemo(() => {
    if (hebrew) {
      const ref = hebrewParts(view)
      return hebrewMonthGrid(view, weekStart).map((d) => {
        const p = hebrewParts(d)
        return { d, inMonth: p.month === ref.month && p.year === ref.year, label: p.dayText }
      })
    }
    const m = view.getMonth()
    return monthGrid(view, weekStart).map((d) => ({ d, inMonth: d.getMonth() === m, label: String(d.getDate()) }))
  }, [view, weekStart, hebrew])
  const headDays = useMemo(() => {
    const names = weekdayNamesShort(lang)
    const start = weekStartIndex(weekStart)
    return Array.from({ length: 7 }, (_, i) => names[(start + i) % 7])
  }, [weekStart, lang])

  const headerLabel = hebrew ? hebrewMonthLabel(view) : `${monthNamesLong()[view.getMonth()]} ${view.getFullYear()}`
  /* Trigger button text — Hebrew (optionally with the Gregorian date when the
     dual display setting is on) or the plain Gregorian per the date_format pref. */
  const triggerText = () => {
    if (!value || !selected) return ph
    if (!hebrew) return fmtDateInput(selected)
    const p = hebrewParts(selected)
    const heb = `${p.dayText} ב${p.month} ${p.yearText}`
    return dual ? `${heb} · ${fmtDateInput(selected)}` : heb
  }

  /* Call onChange with an event-like shape so it's a drop-in for the
     native input handlers (`onChange={(e) => set(e.target.value)}`). */
  const pick = (d) => { onChange?.({ target: { value: isoOf(d) } }); setOpen(false) }
  const shiftMonth = (n) => setView((v) => (hebrew ? stepHebrewMonth(v, n) : new Date(v.getFullYear(), v.getMonth() + n, 1)))
  const shiftYear = (n) => setView((v) => (hebrew ? stepHebrewYear(v, n) : new Date(v.getFullYear() + n, v.getMonth(), 1)))

  return (
    <Box className={`datefield ${className}`} ref={ref}>
      <Btn
        type="button"
        className="datefield-btn"
        disabled={disabled}
        onClick={toggleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Txt className={value ? 'datefield-val' : 'datefield-ph'}>{triggerText()}</Txt>
      </Btn>
      {open && !disabled && (
        <Box className={`datefield-pop${placement === 'top' ? ' up' : ''}`} role="dialog" aria-label={t('dateField.dialogLabel')}>
          <Box className="datefield-nav">
            <Btn type="button" className="datefield-navbtn" onClick={() => shiftYear(-1)} aria-label={t('dateField.prevYear')}>
              <ChevronsRight size={16} strokeWidth={1.8} aria-hidden="true" />
            </Btn>
            <Btn type="button" className="datefield-navbtn" onClick={() => shiftMonth(-1)} aria-label={t('dateField.prevMonth')}>
              <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" />
            </Btn>
            <Txt className="datefield-month">{headerLabel}</Txt>
            <Btn type="button" className="datefield-navbtn" onClick={() => shiftMonth(1)} aria-label={t('dateField.nextMonth')}>
              <ChevronLeft size={16} strokeWidth={1.8} aria-hidden="true" />
            </Btn>
            <Btn type="button" className="datefield-navbtn" onClick={() => shiftYear(1)} aria-label={t('dateField.nextYear')}>
              <ChevronsLeft size={16} strokeWidth={1.8} aria-hidden="true" />
            </Btn>
          </Box>
          <Box className="datefield-dow">{headDays.map((d, i) => <Txt key={i}>{d}</Txt>)}</Box>
          <Box className="datefield-grid">
            {cells.map(({ d: cell, inMonth, label }, i) => {
              const isSel = selected && isSameDay(cell, selected)
              const isToday = isSameDay(cell, new Date())
              return (
                <Btn
                  key={i}
                  type="button"
                  className={`datefield-day${inMonth ? '' : ' out'}${isSel ? ' sel' : ''}${isToday ? ' today' : ''}${hebrew ? ' heb' : ''}`}
                  onClick={() => pick(cell)}
                >
                  {label}
                </Btn>
              )
            })}
          </Box>
          <Btn type="button" className="datefield-today-btn" onClick={() => pick(new Date())}>{t('dateField.today')}</Btn>
        </Box>
      )}
    </Box>
  )
}
