import { useMemo } from 'react'
import { startOfWeek, addDays, eventsForDay, isSameDay, DAY_NAMES_SHORT } from '../../lib/calendar'
import { fmtTime } from '../../lib/dates'

/* 7 vertical strips, one per day in the week containing `date`.
   Each strip stacks the day's events as compact chips. Tap a chip
   to surface the event details, or tap the day header to jump to
   that day's view (parity with the month grid). The current day is
   tinted to anchor the user. */
export default function CalendarWeek({ date, events, onSelect, onPickDay, weekStart = 'sunday' }) {
  const days = useMemo(() => {
    const s = startOfWeek(date, weekStart)
    return Array.from({ length: 7 }, (_, i) => addDays(s, i))
  }, [date, weekStart])
  const today = new Date()

  return (
    <div className="cal-week">
      {days.map((d) => {
        const list = eventsForDay(events, d)
        const allDay = list.filter((e) => e.allDay)
        const timed = list.filter((e) => !e.allDay)
        const isToday = isSameDay(d, today)
        return (
          <div key={d.toISOString()} className={`cal-week-col${isToday ? ' today' : ''}`}>
            <button
              type="button"
              className="cal-week-head"
              onClick={() => onPickDay?.(d)}
              aria-label={d.toDateString()}
            >
              <span className="cal-week-dow">{DAY_NAMES_SHORT[d.getDay()]}</span>
              <span className="cal-week-date mono">{d.getDate()}</span>
            </button>
            <div className="cal-week-body">
              {/* All-day band first — no time, distinct tint. */}
              {allDay.map((ev) => (
                <button
                  key={`${ev.kind}-${ev.id}-${+ev.when}`}
                  type="button"
                  className={`cal-week-evt allday ${ev.kind}`}
                  onClick={() => onSelect?.(ev)}
                >
                  <span className="cal-week-evt-title">{ev.title}</span>
                </button>
              ))}
              {list.length === 0 ? (
                <p className="cal-week-empty">—</p>
              ) : (
                timed.map((ev) => (
                  <button
                    key={`${ev.kind}-${ev.id}-${+ev.when}`}
                    type="button"
                    className={`cal-week-evt ${ev.kind}`}
                    onClick={() => onSelect?.(ev)}
                  >
                    <span className="cal-week-evt-time mono">{fmtTime(ev.when)}</span>
                    <span className="cal-week-evt-title">{ev.title}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
