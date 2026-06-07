import { useEffect, useRef, useState } from 'react'
import { ChevronRight, ChevronLeft, ChevronDown } from 'lucide-react'
import { fmtDayLabel } from '../../lib/calendar'

const VIEWS = [
  { k: 'schedule', l: 'לוח' },
  { k: 'day',      l: 'יום' },
  { k: 'week',     l: 'שבוע' },
  { k: 'month',    l: 'חודש' },
]
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

/* Week + month views step by MONTH (the user navigates between months);
   day + schedule step by day. */
function stepDate(view, date, dir) {
  const d = new Date(date)
  if (view === 'week' || view === 'month') d.setMonth(d.getMonth() + dir)
  else d.setDate(d.getDate() + dir)
  return d
}

/* The month+year picker that sits between the nav arrows in the week and
   month views — click to open a 12-month grid with year stepping. */
function MonthPicker({ date, onPick }) {
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
        {MONTHS[date.getMonth()]} {date.getFullYear()}
        <ChevronDown size={14} strokeWidth={1.7} aria-hidden="true" />
      </button>
      {open && (
        <div className="cal-monthpick-panel" role="dialog" aria-label="בחירת חודש">
          <div className="cal-monthpick-year">
            <button type="button" onClick={() => setYear((y) => y - 1)} aria-label="שנה קודמת"><ChevronRight size={15} strokeWidth={1.7} aria-hidden="true" /></button>
            <span className="mono">{year}</span>
            <button type="button" onClick={() => setYear((y) => y + 1)} aria-label="שנה הבאה"><ChevronLeft size={15} strokeWidth={1.7} aria-hidden="true" /></button>
          </div>
          <div className="cal-monthpick-grid">
            {MONTHS.map((m, i) => {
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

/* Header strip — view-mode pills + month/day navigation. The "schedule"
   view stays range-less. In week/month the arrows jump whole months and
   the centre is a month picker; in day they step a day and show the date.
   RTL: ChevronRight = "previous" (it points toward the past). */
export default function CalendarHeader({ view, onViewChange, date, onDateChange }) {
  const goPrev = () => onDateChange(stepDate(view, date, -1))
  const goNext = () => onDateChange(stepDate(view, date, +1))
  const goToday = () => onDateChange(new Date())
  const monthish = view === 'week' || view === 'month'

  return (
    <div className="cal-header">
      <div className="cal-view-toggle" role="tablist" aria-label="תצוגה">
        {VIEWS.map((v) => (
          <button
            key={v.k}
            type="button"
            className={`cal-view-btn${view === v.k ? ' on' : ''}`}
            onClick={() => onViewChange(v.k)}
            role="tab"
            aria-selected={view === v.k}
          >
            {v.l}
          </button>
        ))}
      </div>

      {view !== 'schedule' && (
        <div className="cal-nav">
          <button type="button" className="cal-nav-btn" onClick={goPrev} aria-label={monthish ? 'חודש קודם' : 'הקודם'}>
            <ChevronRight size={16} strokeWidth={1.6} aria-hidden="true" />
          </button>
          {monthish
            ? <MonthPicker date={date} onPick={onDateChange} />
            : <span className="cal-nav-label">{fmtDayLabel(date)}</span>}
          <button type="button" className="cal-nav-btn" onClick={goNext} aria-label={monthish ? 'חודש הבא' : 'הבא'}>
            <ChevronLeft size={16} strokeWidth={1.6} aria-hidden="true" />
          </button>
          <button type="button" className="cal-nav-today" onClick={goToday}>היום</button>
        </div>
      )}
    </div>
  )
}
