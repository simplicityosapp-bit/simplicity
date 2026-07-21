import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, ChevronLeft, ChevronDown, Check, Bell, Plus } from 'lucide-react'
import { ROUTES } from '../../../lib/routes'
import { tasksAndReminders } from '../../../lib/homeData'
import { formatWhen } from '@simplicity/core'
import { useTasks } from '../../../hooks/useTasks'
import { useReminders } from '../../../hooks/useReminders'
import { useClients } from '../../../hooks/useClients'
import { useProjects } from '../../../hooks/useProjects'
import Modal from '../../../modals/Modal'
import AddTaskModal from '../../../modals/AddTaskModal'
import AddReminderModal from '../../../modals/AddReminderModal'
import { useT } from '../../../i18n/useT'
import { Box, Txt, Btn } from '../../../components/ui'

/* "משימות ותזכורות" — one card for everything still owed.
   Reminders had a card of their own directly beside this one, splitting a
   single question across two boxes with two summaries. Both kinds now share
   one pressure-ordered list (see tasksAndReminders): overdue, then today,
   then flagged urgent, then the rest. Each row keeps its own ✓ — tasks
   toggle, reminders complete — and its due date, which the tasks list never
   used to show even though it was sorted by it. */
export default function NextTasksWidget() {
  const { t } = useT('home')
  const navigate = useNavigate()
  const { tasks, toggleTask, addTask } = useTasks()
  const { reminders, completeReminder, addReminder } = useReminders()
  const { clients } = useClients()
  const { projects } = useProjects()

  const items = useMemo(() => tasksAndReminders(0, { tasks, reminders }), [tasks, reminders])
  const total = items.length
  const overdue = useMemo(() => items.filter((i) => i.bucket === 'overdue').length, [items])
  const today = useMemo(() => items.filter((i) => i.bucket === 'today').length, [items])

  /* The card is never fully shut: it shows the first few rows straight away
     and expands to the rest. A closed card used to be a title plus a sentence
     about what was inside — you had to open it to see a single actual item.
     With ≤PREVIEW rows there is nothing to expand, so no toggle is offered
     rather than leaving a chevron that does nothing. */
  const PREVIEW = 3
  const [open, setOpen] = useState(false)
  const visible = open ? items : items.slice(0, PREVIEW)
  const expandable = items.length > PREVIEW
  /* The header "+" offers the two things this card holds. */
  const [adding, setAdding] = useState(null) /* 'task' | 'reminder' | null */

  /* Late beats due-today beats a bare count: a passed deadline is a fact,
     and the closed card only gets one line. */
  const summary = total === 0
    ? t('widgets.nextTasks.noOpen')
    : overdue > 0
      ? t('widgets.nextTasks.overdueOf', { count: total, overdueText: t('widgets.nextTasks.overdue', { count: overdue }) })
      : today > 0
        ? t('widgets.nextTasks.todayOf', { count: total, todayText: t('widgets.nextTasks.dueToday', { count: today }) })
        : t('widgets.nextTasks.openSummary', { count: total })

  const complete = (it) => {
    if (it.kind === 'task') toggleTask(it.task)
    else completeReminder(it.reminderId)
  }

  return (
    <>
      <Box
        className={`h-card${expandable ? ' is-expandable' : ''}${open ? ' is-open' : ''}`}
        onClick={expandable ? () => setOpen((v) => !v) : undefined}
      >
        <Box className="h-card-head">
          <Txt className="h-card-title">
            <ClipboardList size={20} strokeWidth={1.5} aria-hidden="true" /> {t('widgets.nextTasks.title')}
          </Txt>
          {/* Add sits in the card that owns the thing being added, rather than
              in a separate full-width button further down the screen. */}
          <Btn
            type="button"
            className="h-card-add"
            aria-label={t('widgets.nextTasks.addAria')}
            title={t('widgets.nextTasks.addAria')}
            onClick={(e) => { e.stopPropagation(); setAdding('pick') }}
          >
            <Plus size={15} strokeWidth={2} aria-hidden="true" />
          </Btn>
          <Btn type="button" className="h-card-link" onClick={(e) => { e.stopPropagation(); navigate(ROUTES.TASKS) }}>
            {t('widgets.nextTasks.link', { count: total })}
            <ChevronLeft size={16} strokeWidth={1.6} aria-hidden="true" />
          </Btn>
          {expandable && (
            <Btn
              type="button"
              className="h-card-toggle"
              aria-expanded={open}
              aria-controls="h-tasks-list"
              aria-label={open ? t('widgets.card.showLess') : t('widgets.card.showAll', { count: items.length - PREVIEW })}
              onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
            >
              <ChevronDown size={16} strokeWidth={1.7} className="h-card-chevron" aria-hidden="true" />
            </Btn>
          )}
        </Box>
        {items.length ? (
          <Box className="h-card-list" id="h-tasks-list">
            {visible.map((it) => (
                <Box
                  key={it.id}
                  className="h-task-row"
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); navigate(ROUTES.TASKS) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate(ROUTES.TASKS) } }}
                >
                  <Txt className="h-task-content">
                    {it.kind === 'reminder' ? (
                      <Bell size={13} strokeWidth={1.7} className="h-task-kind" aria-hidden="true" />
                    ) : (
                      <Txt className={`h-task-dot ${it.priority === 'high' ? 'urgent' : 'regular'}`} />
                    )}
                    <Txt className="h-task-text">{it.title}</Txt>
                    {/* The date the list is ordered by. Sorting on something
                        invisible reads as an arbitrary order. */}
                    {it.when && (
                      <Txt className={`h-task-due${it.bucket === 'overdue' ? ' is-overdue' : ''}`}>
                        {formatWhen(it.when)}
                      </Txt>
                    )}
                  </Txt>
                  <Btn
                    type="button"
                    className="h-check"
                    title={t('widgets.nextTasks.markDone')}
                    aria-label={t('widgets.nextTasks.markDone')}
                    onClick={(e) => { e.stopPropagation(); complete(it) }}
                  >
                    <Check size={13} strokeWidth={2} aria-hidden="true" />
                  </Btn>
                </Box>
            ))}
            {/* What the chevron will reveal, said in words. */}
            {expandable && !open && (
              <Txt as="p" className="h-card-more">
                {t('widgets.card.showAll', { count: items.length - PREVIEW })}
              </Txt>
            )}
          </Box>
        ) : (
          <Txt as="p" className="h-card-summary">{summary}</Txt>
        )}
      </Box>

      {/* Two-way picker on the app's own Modal — focus trap, Escape and
          overlay behaviour come with it, rather than a bespoke floating box. */}
      <Modal open={adding === 'pick'} onClose={() => setAdding(null)} title={t('widgets.nextTasks.addTitle')}>
        <Box className="h-add-pick">
          <Btn type="button" className="h-add-pick-btn" onClick={() => setAdding('task')}>
            <ClipboardList size={18} strokeWidth={1.6} aria-hidden="true" />
            <Txt>{t('widgets.nextTasks.addTask')}</Txt>
          </Btn>
          <Btn type="button" className="h-add-pick-btn" onClick={() => setAdding('reminder')}>
            <Bell size={18} strokeWidth={1.6} aria-hidden="true" />
            <Txt>{t('widgets.nextTasks.addReminder')}</Txt>
          </Btn>
        </Box>
      </Modal>
      <AddTaskModal
        open={adding === 'task'}
        onClose={() => setAdding(null)}
        projects={projects}
        clients={clients}
        onSave={addTask}
      />
      <AddReminderModal
        open={adding === 'reminder'}
        onClose={() => setAdding(null)}
        clients={clients}
        onSave={addReminder}
      />
    </>
  )
}
