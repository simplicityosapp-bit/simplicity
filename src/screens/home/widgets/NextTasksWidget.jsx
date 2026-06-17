import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, ChevronLeft, Check } from 'lucide-react'
import { ROUTES } from '../../../lib/routes'
import { nextTasks, openTasksCount } from '../../../lib/homeData'
import { useTasks } from '../../../hooks/useTasks'
import { useT } from '../../../i18n/useT'

/* Next 3-5 open tasks by priority. Row → tasks screen; the ✓ marks done. */
export default function NextTasksWidget() {
  const { t } = useT('home')
  const navigate = useNavigate()
  const { tasks, toggleTask } = useTasks()
  const items = useMemo(() => nextTasks(999, tasks), [tasks])   /* all open, by priority */
  const total = useMemo(() => openTasksCount(tasks), [tasks])
  const urgent = useMemo(
    () => (tasks || []).filter((t) => !t.deleted_at && t.status !== 'done' && t.priority === 'high').length,
    [tasks],
  )
  /* Closed = title + summary; click opens the full list of every open task. */
  const [open, setOpen] = useState(false)

  const summary = total === 0
    ? t('widgets.nextTasks.noOpen')
    : urgent > 0
      ? t('widgets.nextTasks.urgentOf', { count: total, urgentText: t('widgets.nextTasks.urgent', { count: urgent }) })
      : t('widgets.nextTasks.openSummary', { count: total })

  return (
    <div
      className={`h-card is-expandable${open ? ' is-open' : ''}`}
      onClick={() => setOpen((v) => !v)}
    >
      <div className="h-card-head">
        <span className="h-card-title">
          <ClipboardList size={20} strokeWidth={1.5} aria-hidden="true" /> {t('widgets.nextTasks.title')}
        </span>
        <button type="button" className="h-card-link" onClick={(e) => { e.stopPropagation(); navigate(ROUTES.TASKS) }}>
          {t('widgets.nextTasks.link', { count: total })}
          <ChevronLeft size={16} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
      {open ? (
        <div className="h-card-list">
          {items.length ? (
            items.map((task) => (
              <div
                key={task.id}
                className="h-task-row"
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); navigate(ROUTES.TASKS) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate(ROUTES.TASKS) } }}
              >
                <span className="h-task-content">
                  <span className={`h-task-dot ${task.priority === 'high' ? 'urgent' : 'regular'}`} />
                  <span className="h-task-text">{task.title}</span>
                </span>
                <button type="button" className="h-check" title={t('widgets.nextTasks.markDone')} aria-label={t('widgets.nextTasks.markDone')} onClick={(e) => { e.stopPropagation(); toggleTask(task) }}>
                  <Check size={13} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            ))
          ) : (
            <p className="h-card-empty">{t('widgets.nextTasks.allDone', { add: t('widgets.nextTasks.addWord') })}</p>
          )}
        </div>
      ) : (
        <p className="h-card-summary">{summary}</p>
      )}
    </div>
  )
}
