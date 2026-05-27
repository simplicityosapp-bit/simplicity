import { useMemo } from 'react'
import { monthGrid, eventsByDate, isSameDay, dateKey, DAY_NAMES_SHORT, weekStartIndex } from '../../lib/calendar'

const MAX_DOTS = 3

/* 6-week month grid (always 42 cells — every layout fits, no
   exceptions). Cells outside the month dim. Each cell shows up to
   3 dots tinted by event kind (sage = meeting, amber = reminder).
   Tap a cell → switch to the day view on that date. */
export default function CalendarMonth({ date, events, onPickDay, weekStart = 'sunday' }) {
  const grid = useMemo(() => monthGrid(date, weekStart), [date, weekStart])
  const eventsMap = useMemo(() => eventsByDate(events), [events])
  const today = new Date()
  const month = date.getMonth()

  /* Re-order the weekday header to match the user's weekStart. */
  const weekdayHeader = useMemo(() => {
    const start = weekStartIndex(weekStart)
    const out = []
    for (let i = 0; i < 7; i++) out.push(DAY_NAMES_SHORT[(start + i) % 7])
    return out
  }, [weekStart])

  return (
    <div className="cal-month">
      <div className="cal-month-dow-row">
        {weekdayHeader.map((d, i) => (
          <span key={i} className="cal-month-dow">{d}</span>
        ))}
      </div>
      <div className="cal-month-grid">
        {grid.map((d) => {
          const inMonth = d.getMonth() === month
          const isToday = isSameDay(d, today)
          const dayEvents = eventsMap.get(dateKey(d)) || []
          return (
            <button
              key={d.toISOString()}
              type="button"
              className={`cal-month-cell${inMonth ? '' : ' dim'}${isToday ? ' today' : ''}`}
              onClick={() => onPickDay?.(d)}
              aria-label={d.toDateString()}
            >
              <span className="cal-month-num mono">{d.getDate()}</span>
              {dayEvents.length > 0 && (
                <span className="cal-month-dots">
                  {dayEvents.slice(0, MAX_DOTS).map((ev, i) => (
                    <span key={i} className={`cal-month-dot ${ev.kind}`} aria-hidden="true" />
                  ))}
                  {dayEvents.length > MAX_DOTS && (
                    <span className="cal-month-more mono">+{dayEvents.length - MAX_DOTS}</span>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
