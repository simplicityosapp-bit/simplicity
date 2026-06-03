import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, ChevronLeft, Check } from 'lucide-react'
import { ROUTES } from '../../../lib/routes'
import { remindersUpcoming } from '../../../lib/homeData'
import { formatWhen } from '../../../lib/dates'
import { useReminders } from '../../../hooks/useReminders'

/* Upcoming reminders (today → +60d). The ✓ marks a reminder done. */
export default function RemindersWidget() {
  const navigate = useNavigate()
  const { reminders, completeReminder } = useReminders()
  const items = useMemo(() => remindersUpcoming(new Date(), reminders, 60, 0), [reminders])   /* all upcoming */
  /* Closed = title + summary; click opens the full list of every reminder. */
  const [open, setOpen] = useState(false)

  const todayCount = useMemo(() => {
    const now = new Date()
    const isToday = (d) => d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    return items.filter((r) => isToday(new Date(r.when))).length
  }, [items])

  const summary = items.length === 0
    ? 'אין תזכורות קרובות'
    : todayCount > 0
      ? `${todayCount} להיום · ${items.length} ${items.length === 1 ? 'קרובה' : 'קרובות'}`
      : `${items.length} ${items.length === 1 ? 'תזכורה קרובה' : 'תזכורות קרובות'}`

  return (
    <div
      className={`h-card is-expandable${open ? ' is-open' : ''}`}
      onClick={() => setOpen((v) => !v)}
    >
      <div className="h-card-head">
        <span className="h-card-title">
          <Clock size={20} strokeWidth={1.5} aria-hidden="true" /> תזכורות קרובות
        </span>
        <button type="button" className="h-card-link" onClick={(e) => { e.stopPropagation(); navigate(ROUTES.CALENDAR) }}>
          {items.length} {items.length === 1 ? 'פעילה' : 'פעילויות'}
          <ChevronLeft size={16} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
      {open ? (
        <div className="h-card-list">
          {items.length ? (
            items.map((r) => (
              <div key={r.id} className="h-rem-row">
                <span className="h-rem-text">{r.title}</span>
                <span className="h-rem-when">{formatWhen(r.when)}</span>
                <button type="button" className="h-check" title="בוצעה" aria-label="סמן כבוצעה" onClick={(e) => { e.stopPropagation(); completeReminder(r.id) }}>
                  <Check size={13} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            ))
          ) : (
            <p className="h-card-empty">אין תזכורות קרובות — הכל רגוע.</p>
          )}
        </div>
      ) : (
        <p className="h-card-summary">{summary}</p>
      )}
    </div>
  )
}
