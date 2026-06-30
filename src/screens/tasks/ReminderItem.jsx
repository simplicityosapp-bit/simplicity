import { memo } from 'react'
import { Check, Pencil } from 'lucide-react'
import { formatWhen } from '../../lib/dates'
import { useT } from '../../i18n/useT'
import InlineTitle from './InlineTitle'

/* Mirrors TaskItem visually so the Tasks ↔ Reminders toggle keeps a
   single look. Status is "pending" → unchecked, "completed" → checked.
   The meta line shows the scheduled date/time and (optional) linked
   client. Dot color signals urgency: clay if overdue, amber if today,
   sage otherwise. */
function ReminderItem({ reminder, clientName, dotColor, onComplete, onEdit, onRename, count = 1, index, category }) {
  const { t } = useT('tasks')
  const isDone = reminder.status === 'completed'
  const meta = [clientName, formatWhen(reminder.scheduled_at)].filter(Boolean).join(' · ')

  return (
    <div className={`tc anim${isDone ? ' is-done' : ''}`} style={{ animationDelay: `${index * 0.04}s` }}>
      <button
        type="button"
        className={`tc-chk${isDone ? ' on' : ''}`}
        onClick={() => !isDone && onComplete?.(reminder)}
        aria-pressed={isDone}
        aria-label={isDone ? t('item.reminderDone') : t('item.checkReminder')}
      >
        {isDone && <Check size={13} strokeWidth={2.5} aria-hidden="true" />}
      </button>
      <div className="tc-body">
        <InlineTitle
          className="tc-title"
          title={reminder.title}
          onRename={onRename ? (next) => onRename(reminder.id, next) : undefined}
        >
          {count > 1 && <span className="tc-recur-count" title={t('item.pendingOccurrences', { n: count })}>×{count}</span>}
        </InlineTitle>
        {meta && <p className="tc-meta">{meta}</p>}
        {category && (
          <div className="tc-tags">
            <span className="tc-tag">
              <span className="tc-tag-dot" style={{ background: category.color || 'var(--stone)' }} />
              {category.name}
            </span>
          </div>
        )}
      </div>
      {onEdit && (
        <button type="button" className="tc-edit" onClick={() => onEdit(reminder)} aria-label={t('item.editReminder')}>
          <Pencil size={13} strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
      <span className="tc-dot" style={{ background: dotColor }} aria-hidden="true" />
    </div>
  )
}

export default memo(ReminderItem)
