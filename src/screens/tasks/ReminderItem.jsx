import { memo } from 'react'
import { Check } from 'lucide-react'
import { formatWhen } from '../../lib/dates'

/* Mirrors TaskItem visually so the Tasks ↔ Reminders toggle keeps a
   single look. Status is "pending" → unchecked, "completed" → checked.
   The meta line shows the scheduled date/time and (optional) linked
   client. Dot color signals urgency: clay if overdue, amber if today,
   sage otherwise. */
function ReminderItem({ reminder, clientName, dotColor, onComplete, count = 1, index }) {
  const isDone = reminder.status === 'completed'
  const meta = [clientName, formatWhen(reminder.scheduled_at)].filter(Boolean).join(' · ')

  return (
    <div className={`tc anim${isDone ? ' is-done' : ''}`} style={{ animationDelay: `${index * 0.04}s` }}>
      <button
        type="button"
        className={`tc-chk${isDone ? ' on' : ''}`}
        onClick={() => !isDone && onComplete?.(reminder)}
        aria-pressed={isDone}
        aria-label={isDone ? 'בוצעה' : 'סמן כבוצעה'}
      >
        {isDone && <Check size={13} strokeWidth={2.5} aria-hidden="true" />}
      </button>
      <div className="tc-body">
        <p className="tc-title">
          {reminder.title}
          {count > 1 && <span className="tc-recur-count" title={`${count} מופעים שטרם בוצעו`}>×{count}</span>}
        </p>
        {meta && <p className="tc-meta">{meta}</p>}
      </div>
      <span className="tc-dot" style={{ background: dotColor }} aria-hidden="true" />
    </div>
  )
}

export default memo(ReminderItem)
