import { memo } from 'react'
import { Check, Pencil, Repeat, CalendarClock } from 'lucide-react'
import { formatWhen, isRecurring, daysUntilLabel } from '@simplicity/core'
import { useT } from '../../i18n/useT'
import InlineTitle from './InlineTitle'
import DueInTag from '../../components/DueInTag'
import { Box, Txt, Btn } from '../../components/ui'

/* The recurrence, in words. On the open list a recurring reminder is otherwise
   indistinguishable from a one-off — same row, same single date — so the
   schedule it belongs to only showed up if you went looking in "חוזרות".
   Falls back to a bare "חוזרת" if the pattern is missing or unrecognised, so a
   half-written row still admits that it repeats. */
function repeatLabel(reminder, t) {
  if (!isRecurring(reminder)) return null
  const p = reminder.recurrence_pattern || {}
  if (reminder.recurrence_type === 'weekly' && p.dayOfWeek != null) {
    return t('item.repeatWeekly', { day: t(`days.${p.dayOfWeek}`) })
  }
  if (reminder.recurrence_type === 'monthly_date' && p.dayOfMonth != null) {
    return t('item.repeatMonthly', { dom: p.dayOfMonth })
  }
  if (reminder.recurrence_type === 'every_x_days') {
    const x = Number(p.x) || 1
    return x === 1 ? t('item.repeatDaily') : t('item.repeatEveryX', { x })
  }
  return t('item.repeatGeneric')
}

/* Mirrors TaskItem visually so the Tasks ↔ Reminders toggle keeps a
   single look. Status is "pending" → unchecked, "completed" → checked.
   The meta line shows the scheduled date/time and (optional) linked
   client. Dot color signals urgency: clay if overdue, amber if today,
   sage otherwise. */
/* `subjectName` — whatever the reminder is linked to, not just a client: a
   project, a group and the investment view can all own one. Named for the
   link rather than for one of its kinds, because it was called clientName
   while the screen fed it a field reminders do not have. */
function ReminderItem({ reminder, subjectName, dotColor, onComplete, onEdit, onRename, onPostpone, count = 1, index, category, selectMode = false, selected = false, onSelect }) {
  const { t } = useT('tasks')
  const isDone = reminder.status === 'completed'
  const meta = [subjectName, formatWhen(reminder.scheduled_at)].filter(Boolean).join(' · ')
  const repeat = repeatLabel(reminder, t)
  /* Asked here rather than inside the tag so the tags row itself can stay
     unrendered when the countdown is the only thing that would have been in
     it and it has nothing to say. A done reminder is not due in any number
     of days, so it never gets one. */
  const showDueIn = !isDone && !!daysUntilLabel(reminder.scheduled_at)

  return (
    <Box className={`tc anim${isDone ? ' is-done' : ''}${selectMode ? ' is-selectable' : ''}${selected ? ' is-selected' : ''}`} style={{ animationDelay: `${index * 0.04}s` }}>
      {/* Selection borrows the circle while select mode is on — see TaskItem. */}
      <Btn
        type="button"
        className={`tc-chk${(selectMode ? selected : isDone) ? ' on' : ''}`}
        onClick={() => (selectMode ? onSelect?.() : (!isDone && onComplete?.(reminder)))}
        aria-pressed={selectMode ? selected : isDone}
        aria-label={selectMode ? reminder.title : (isDone ? t('item.reminderDone') : t('item.checkReminder'))}
      >
        {(selectMode ? selected : isDone) && <Check size={13} strokeWidth={2.5} aria-hidden="true" />}
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
        {/* Same details box, same two-line clamp as TaskItem — this row exists
            to mirror that one, and a reminder has carried the field for even
            longer without ever showing it. */}
        {reminder.description && (
          <Txt as="p" className="tc-desc">{reminder.description}</Txt>
        )}
        {(repeat || category || showDueIn) && (
          <Box className="tc-tags">
            {showDueIn && <DueInTag date={reminder.scheduled_at} />}
            {repeat && (
              <Txt className="tc-tag tc-tag-repeat">
                <Repeat size={10} strokeWidth={1.8} aria-hidden="true" />
                {repeat}
              </Txt>
            )}
            {category && (
              <Txt className="tc-tag">
                <Txt className="tc-tag-dot" style={{ background: category.color || 'var(--stone)' }} />
                {category.name}
              </Txt>
            )}
          </Box>
        )}
      </Box>
      {/* Only where the parent says postponing means something — see TaskItem. */}
      {onPostpone && !isDone && (
        <Btn type="button" className="tc-edit tc-postpone" onClick={() => onPostpone(reminder)} aria-label={t('item.snooze')} title={t('item.snooze')}>
          <CalendarClock size={13} strokeWidth={1.5} aria-hidden="true" />
        </Btn>
      )}
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
