import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, ChevronLeft, ChevronDown, Check } from 'lucide-react'
import { ROUTES } from '../../../lib/routes'
import { nextTasks, openTasksCount, overdueTasksCount } from '../../../lib/homeData'
import { formatWhen } from '@simplicity/core'
import { useTasks } from '../../../hooks/useTasks'
import { useT } from '../../../i18n/useT'
import { Box, Txt, Btn } from '../../../components/ui'

/* Next 3-5 open tasks by priority. Row → tasks screen; the ✓ marks done. */
export default function NextTasksWidget() {
  const { t } = useT('home')
  const navigate = useNavigate()
  const { tasks, toggleTask } = useTasks()
  /* All open tasks, most pressing first — overdue, then due today, then
     flagged urgent. Home used to sort on priority alone and never showed a
     due date, so a task due this morning could sit below an undated one. */
  const items = useMemo(() => nextTasks(999, tasks), [tasks])
  const total = useMemo(() => openTasksCount(tasks), [tasks])
  const overdue = useMemo(() => overdueTasksCount(tasks), [tasks])
  const urgent = useMemo(
    () => (tasks || []).filter((t) => !t.deleted_at && t.status !== 'done' && t.priority === 'high').length,
    [tasks],
  )
  /* Closed = title + summary; click opens the full list of every open task. */
  const [open, setOpen] = useState(false)

  /* Late beats urgent in the one line the closed card gets: a passed
     deadline is a fact, "high priority" is a label. */
  const summary = total === 0
    ? t('widgets.nextTasks.noOpen')
    : overdue > 0
      ? t('widgets.nextTasks.overdueOf', { count: total, overdueText: t('widgets.nextTasks.overdue', { count: overdue }) })
      : urgent > 0
        ? t('widgets.nextTasks.urgentOf', { count: total, urgentText: t('widgets.nextTasks.urgent', { count: urgent }) })
        : t('widgets.nextTasks.openSummary', { count: total })

  return (
    <Box
      className={`h-card is-expandable${open ? ' is-open' : ''}`}
      onClick={() => setOpen((v) => !v)}
    >
      <Box className="h-card-head">
        <Txt className="h-card-title">
          <ClipboardList size={20} strokeWidth={1.5} aria-hidden="true" /> {t('widgets.nextTasks.title')}
        </Txt>
        <Btn type="button" className="h-card-link" onClick={(e) => { e.stopPropagation(); navigate(ROUTES.TASKS) }}>
          {t('widgets.nextTasks.link', { count: total })}
          <ChevronLeft size={16} strokeWidth={1.6} aria-hidden="true" />
        </Btn>
        {/* Real disclosure control — see the note in AttentionWidget. */}
        <Btn
          type="button"
          className="h-card-toggle"
          aria-expanded={open}
          aria-controls="h-tasks-list"
          aria-label={open ? t('widgets.card.collapse') : t('widgets.card.expand')}
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        >
          <ChevronDown size={16} strokeWidth={1.7} className="h-card-chevron" aria-hidden="true" />
        </Btn>
      </Box>
      {open ? (
        <Box className="h-card-list" id="h-tasks-list">
          {items.length ? (
            items.map((task) => (
              <Box
                key={task.id}
                className="h-task-row"
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); navigate(ROUTES.TASKS) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate(ROUTES.TASKS) } }}
              >
                <Txt className="h-task-content">
                  <Txt className={`h-task-dot ${task.priority === 'high' ? 'urgent' : 'regular'}`} />
                  <Txt className="h-task-text">{task.title}</Txt>
                  {/* The date the list is now ordered by. Sorting on something
                      invisible reads as an arbitrary order. */}
                  {task.due_at && (
                    <Txt className={`h-task-due${new Date(task.due_at) < new Date() ? ' is-overdue' : ''}`}>
                      {formatWhen(task.due_at)}
                    </Txt>
                  )}
                </Txt>
                <Btn type="button" className="h-check" title={t('widgets.nextTasks.markDone')} aria-label={t('widgets.nextTasks.markDone')} onClick={(e) => { e.stopPropagation(); toggleTask(task) }}>
                  <Check size={13} strokeWidth={2} aria-hidden="true" />
                </Btn>
              </Box>
            ))
          ) : (
            <Txt as="p" className="h-card-empty">{t('widgets.nextTasks.allDone', { add: t('widgets.nextTasks.addWord') })}</Txt>
          )}
        </Box>
      ) : (
        <Txt as="p" className="h-card-summary">{summary}</Txt>
      )}
    </Box>
  )
}
