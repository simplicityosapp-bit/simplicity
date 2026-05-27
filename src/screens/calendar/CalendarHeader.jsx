import { ChevronRight, ChevronLeft } from 'lucide-react'
import { addDays, fmtDayLabel, fmtWeekLabel, fmtMonthLabel } from '../../lib/calendar'

const VIEWS = [
  { k: 'schedule', l: 'לוח' },
  { k: 'day',      l: 'יום' },
  { k: 'week',     l: 'שבוע' },
  { k: 'month',    l: 'חודש' },
]

function stepDate(view, date, dir) {
  const d = new Date(date)
  if (view === 'day' || view === 'schedule') {
    d.setDate(d.getDate() + dir)
  } else if (view === 'week') {
    d.setDate(d.getDate() + 7 * dir)
  } else if (view === 'month') {
    d.setMonth(d.getMonth() + dir)
  }
  return d
}

function rangeLabel(view, date, weekStart) {
  if (view === 'day') return fmtDayLabel(date)
  if (view === 'week') return fmtWeekLabel(date, weekStart)
  if (view === 'month') return fmtMonthLabel(date)
  return 'אירועים קרובים'
}

/* Header strip — view-mode pills, date navigation (prev/today/next),
   and the human-readable range label. The "schedule" view stays
   range-less (it's just "upcoming"). RTL: ChevronRight visually
   means "previous" because the icon points toward the past in LTR
   terms; in RTL it lives on the right and feels like "back". */
export default function CalendarHeader({ view, onViewChange, date, onDateChange, weekStart }) {
  const goPrev = () => onDateChange(stepDate(view, date, -1))
  const goNext = () => onDateChange(stepDate(view, date, +1))
  const goToday = () => onDateChange(new Date())

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
          <button type="button" className="cal-nav-btn" onClick={goPrev} aria-label="הקודם">
            <ChevronRight size={16} strokeWidth={1.6} aria-hidden="true" />
          </button>
          <button type="button" className="cal-nav-today" onClick={goToday}>היום</button>
          <button type="button" className="cal-nav-btn" onClick={goNext} aria-label="הבא">
            <ChevronLeft size={16} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </div>
      )}

      <p className="cal-range-label">{rangeLabel(view, date, weekStart)}</p>
    </div>
  )
}
