import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import { monthGrid, MONTH_NAMES_HE, DAY_NAMES_SHORT, isSameDay, weekStartIndex } from '../lib/calendar'
import { fmtDateInput } from '../lib/dates'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { useAddress } from '../hooks/useAddress'
import './DateField.css'

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

export default function DateField({ value, onChange, className = '', disabled = false, placeholder }) {
  const { addr } = useAddress()
  const ph = placeholder ?? addr({ male: 'בחר תאריך', female: 'בחרי תאריך', neutral: 'בחר/י תאריך' })
  const { prefs } = useUserPreferences()
  const weekStart = prefs?.format?.week_start || 'sunday'
  const selected = parse(value)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => selected || new Date())
  const ref = useRef(null)

  /* Jump the calendar to the selected month when opening (no effect — the
     sync happens in the toggle handler to avoid setState-in-render). */
  const toggleOpen = () => {
    if (!open) { const s = parse(value); if (s) setView(s) }
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

  const grid = useMemo(() => monthGrid(view, weekStart), [view, weekStart])
  const headDays = useMemo(() => {
    const start = weekStartIndex(weekStart)
    return Array.from({ length: 7 }, (_, i) => DAY_NAMES_SHORT[(start + i) % 7])
  }, [weekStart])

  /* Call onChange with an event-like shape so it's a drop-in for the
     native input handlers (`onChange={(e) => set(e.target.value)}`). */
  const pick = (d) => { onChange?.({ target: { value: isoOf(d) } }); setOpen(false) }
  const shift = (n) => setView((v) => new Date(v.getFullYear(), v.getMonth() + n, 1))

  return (
    <div className={`datefield ${className}`} ref={ref}>
      <button
        type="button"
        className="datefield-btn"
        disabled={disabled}
        onClick={toggleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={value ? 'datefield-val' : 'datefield-ph'}>{value ? fmtDateInput(selected) : ph}</span>
      </button>
      {open && !disabled && (
        <div className="datefield-pop" role="dialog" aria-label="בחירת תאריך">
          <div className="datefield-nav">
            <button type="button" className="datefield-navbtn" onClick={() => shift(-1)} aria-label="חודש קודם">
              <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
            <span className="datefield-month">{MONTH_NAMES_HE[view.getMonth()]} {view.getFullYear()}</span>
            <button type="button" className="datefield-navbtn" onClick={() => shift(1)} aria-label="חודש הבא">
              <ChevronLeft size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
          <div className="datefield-dow">{headDays.map((d, i) => <span key={i}>{d}</span>)}</div>
          <div className="datefield-grid">
            {grid.map((cell, i) => {
              const inMonth = cell.getMonth() === view.getMonth()
              const isSel = selected && isSameDay(cell, selected)
              const isToday = isSameDay(cell, new Date())
              return (
                <button
                  key={i}
                  type="button"
                  className={`datefield-day${inMonth ? '' : ' out'}${isSel ? ' sel' : ''}${isToday ? ' today' : ''}`}
                  onClick={() => pick(cell)}
                >
                  {cell.getDate()}
                </button>
              )
            })}
          </div>
          <button type="button" className="datefield-today-btn" onClick={() => pick(new Date())}>היום</button>
        </div>
      )}
    </div>
  )
}
