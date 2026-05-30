import { Check } from 'lucide-react'
import { formatWhen } from '../../lib/dates'

/* Mirrors TaskItem visually so the Tasks ↔ Reminders toggle keeps a
   single look. Status is "pending" → unchecked, "completed" → checked.
   The meta line shows the scheduled date/time and (optional) linked
   client. Dot color signals urgency: clay if overdue, amber if today,
   sage otherwise. */
export default function ReminderItem({ reminder, clientName, dotColor, onComplete, index }) {
  const isDone = reminder.status === 'completed'
  const meta = [clientName, formatWhen(reminder.scheduled_at)].filter(Boolean).join(' · ')

  return (
    <div className={`tc anim${isDone ? ' is-done' : ''}`} style={{ animationDelay: `${index * 0.04}s` }}>
      <button
        type="button"
        className={`tc-chk${isDone ? ' on' : ''}`}
        onClick={() => !isDone && onComplete?.(reminder.id)}
        aria-pressed={isDone}
        aria-label={isDone ? 'בוצעה' : 'סמן כבוצעה'}
      >
        {isDone && <Check size={13} strokeWidth={2.5} aria-hidden="true" />}
      </button>
      <div className="tc-body">
        <p className="tc-title">{reminder.title}</p>
        {meta && <p className="tc-meta">{meta}</p>}
      </div>
      <span className="tc-dot" style={{ background: dotColor }} aria-hidden="true" />
    </div>
  )
}
