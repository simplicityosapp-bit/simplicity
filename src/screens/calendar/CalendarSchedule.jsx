import { Clock, CalendarDays } from 'lucide-react'
import { formatWhen } from '../../lib/dates'

/* The original list view — kept verbatim under the new toggle.
   Items already come merged (meetings + reminders) and sorted. */
export default function CalendarSchedule({ items, onSelect }) {
  if (!items.length) {
    return (
      <div className="empty">
        <p className="empty-text">אין אירועים קרובים — לוח נקי.</p>
      </div>
    )
  }
  return (
    <section className="cal-list">
      {items.map((it) => (
        <button
          key={`${it.kind}-${it.id}`}
          type="button"
          className="cal-item"
          onClick={() => onSelect?.(it)}
        >
          <span className={`cal-icon ${it.kind}`}>
            {it.kind === 'meeting'
              ? <CalendarDays size={16} strokeWidth={1.6} aria-hidden="true" />
              : <Clock size={16} strokeWidth={1.6} aria-hidden="true" />}
          </span>
          <div className="cal-body">
            <p className="cal-title">{it.title}</p>
            <p className="cal-when">{formatWhen(it.when)}</p>
          </div>
          {it.kind === 'meeting' && it.status === 'pending' && <span className="cal-tag">ממתינה</span>}
          {it.kind === 'reminder' && <span className="cal-tag rem">תזכורת</span>}
        </button>
      ))}
    </section>
  )
}
