import { useMemo } from 'react'
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
  const items = useMemo(() => remindersUpcoming(new Date(), reminders), [reminders])

  return (
    <div className="h-card">
      <div className="h-card-head">
        <span className="h-card-title">
          <Clock size={20} strokeWidth={1.5} aria-hidden="true" /> תזכורות קרובות
        </span>
        <button type="button" className="h-card-link" onClick={() => navigate(ROUTES.CALENDAR)}>
          {items.length} {items.length === 1 ? 'פעילה' : 'פעילויות'}
          <ChevronLeft size={16} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
      <div className="h-card-list">
        {items.length ? (
          items.map((r) => (
            <div key={r.id} className="h-rem-row">
              <span className="h-rem-text">{r.title}</span>
              <span className="h-rem-when">{formatWhen(r.when)}</span>
              <button type="button" className="h-check" title="בוצעה" aria-label="סמן כבוצעה" onClick={() => completeReminder(r.id)}>
                <Check size={13} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          ))
        ) : (
          <p className="h-card-empty">אין תזכורות קרובות — הכל רגוע.</p>
        )}
      </div>
    </div>
  )
}
