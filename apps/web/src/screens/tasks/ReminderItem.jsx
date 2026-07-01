import { memo } from 'react'
import { Check, Pencil } from 'lucide-react'
import { formatWhen } from '../../lib/dates'
import { useT } from '../../i18n/useT'
import InlineTitle from './InlineTitle'
import { Box, Txt, Btn } from '../../components/ui'

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
    <Box className={`tc anim${isDone ? ' is-done' : ''}`} style={{ animationDelay: `${index * 0.04}s` }}>
      <Btn
        type="button"
        className={`tc-chk${isDone ? ' on' : ''}`}
        onClick={() => !isDone && onComplete?.(reminder)}
        aria-pressed={isDone}
        aria-label={isDone ? t('item.reminderDone') : t('item.checkReminder')}
      >
        {isDone && <Check size={13} strokeWidth={2.5} aria-hidden="true" />}
      </Btn>
      <Box className="tc-body">
        <InlineTitle
          className="tc-title"
          title={reminder.title}
          onRename={onRename ? (next) => onRename(reminder.id, next) : undefined}
        >
          {count > 1 && <Txt className="tc-recur-count" title={t('item.pendingOccurrences', { n: count })}>×{count}</Txt>}
        </InlineTitle>
        {meta && <Txt as="p" className="tc-meta">{meta}</Txt>}
        {category && (
          <Box className="tc-tags">
            <Txt className="tc-tag">
              <Txt className="tc-tag-dot" style={{ background: category.color || 'var(--stone)' }} />
              {category.name}
            </Txt>
          </Box>
        )}
      </Box>
      {onEdit && (
        <Btn type="button" className="tc-edit" onClick={() => onEdit(reminder)} aria-label={t('item.editReminder')}>
          <Pencil size={13} strokeWidth={1.5} aria-hidden="true" />
        </Btn>
      )}
      <Txt className="tc-dot" style={{ background: dotColor }} aria-hidden="true" />
    </Box>
  )
}

export default memo(ReminderItem)
