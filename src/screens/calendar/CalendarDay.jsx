import { useMemo } from 'react'
import { eventsForDay } from '../../lib/calendar'
import { fmtTime } from '../../lib/dates'

const DEFAULT_START = 6
const DEFAULT_END = 22

/* 24-hour vertical timeline — one row per hour in the visible range
   (defaults 06:00–22:00, overridable via userPreferences). Events
   are placed in the hour row matching their scheduled_at; multiple
   events in the same hour stack inside the row. */
export default function CalendarDay({ date, events, onSelect, dayViewStart = DEFAULT_START, dayViewEnd = DEFAULT_END }) {
  const hours = useMemo(() => {
    const start = Math.max(0, Math.min(23, dayViewStart))
    const end = Math.max(start, Math.min(23, dayViewEnd))
    const out = []
    for (let h = start; h <= end; h++) out.push(h)
    return out
  }, [dayViewStart, dayViewEnd])

  const dayEvents = useMemo(() => eventsForDay(events, date), [events, date])

  /* Pre-bucket the events by hour for fast lookup inside the loop. */
  const byHour = useMemo(() => {
    const m = new Map()
    for (const ev of dayEvents) {
      const h = new Date(ev.when).getHours()
      const list = m.get(h) || []
      list.push(ev)
      m.set(h, list)
    }
    return m
  }, [dayEvents])

  const earlyEvents = useMemo(
    () => dayEvents.filter((e) => new Date(e.when).getHours() < hours[0]),
    [dayEvents, hours],
  )
  const lateEvents = useMemo(
    () => dayEvents.filter((e) => new Date(e.when).getHours() > hours[hours.length - 1]),
    [dayEvents, hours],
  )

  return (
    <div className="cal-day">
      {earlyEvents.length > 0 && (
        <div className="cal-day-edge">
          <p className="cal-day-edge-lbl">לפני {String(hours[0]).padStart(2, '0')}:00</p>
          {earlyEvents.map((ev) => <DayEvent key={`${ev.kind}-${ev.id}`} event={ev} onSelect={onSelect} />)}
        </div>
      )}

      <div className="cal-day-grid">
        {hours.map((h) => {
          const slot = byHour.get(h) || []
          return (
            <div key={h} className="cal-day-row">
              <div className="cal-day-hour mono">{String(h).padStart(2, '0')}:00</div>
              <div className="cal-day-slot">
                {slot.length === 0 ? (
                  <div className="cal-day-empty-line" aria-hidden="true" />
                ) : (
                  slot.map((ev) => <DayEvent key={`${ev.kind}-${ev.id}`} event={ev} onSelect={onSelect} />)
                )}
              </div>
            </div>
          )
        })}
      </div>

      {lateEvents.length > 0 && (
        <div className="cal-day-edge">
          <p className="cal-day-edge-lbl">אחרי {String(hours[hours.length - 1]).padStart(2, '0')}:00</p>
          {lateEvents.map((ev) => <DayEvent key={`${ev.kind}-${ev.id}`} event={ev} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  )
}

function DayEvent({ event, onSelect }) {
  return (
    <button
      type="button"
      className={`cal-day-evt ${event.kind}`}
      onClick={() => onSelect?.(event)}
    >
      <span className="cal-day-evt-time mono">{fmtTime(event.when)}</span>
      <span className="cal-day-evt-title">{event.title}</span>
      {event.kind === 'meeting' && event.status === 'pending' && <span className="cal-tag">ממתינה</span>}
      {event.kind === 'reminder' && <span className="cal-tag rem">תזכורת</span>}
      {event.kind === 'calendar' && <span className="cal-tag cal">יומן</span>}
    </button>
  )
}
