import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, ChevronLeft, Check } from 'lucide-react'
import { ROUTES } from '../../../lib/routes'
import { nextTasks, openTasksCount } from '../../../lib/homeData'
import { useTasks } from '../../../hooks/useTasks'
import { useAddress } from '../../../hooks/useAddress'

/* Next 3-5 open tasks by priority. Row → tasks screen; the ✓ marks done. */
export default function NextTasksWidget() {
  const { addr } = useAddress()
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
    ? 'אין משימות פתוחות'
    : urgent > 0
      ? `${urgent} ${urgent === 1 ? 'דחופה' : 'דחופות'} מתוך ${total} ${total === 1 ? 'פתוחה' : 'פתוחות'}`
      : `${total} ${total === 1 ? 'משימה פתוחה' : 'משימות פתוחות'}`

  return (
    <div
      className={`h-card is-expandable${open ? ' is-open' : ''}`}
      onClick={() => setOpen((v) => !v)}
    >
      <div className="h-card-head">
        <span className="h-card-title">
          <ClipboardList size={20} strokeWidth={1.5} aria-hidden="true" /> המשימות הבאות
        </span>
        <button type="button" className="h-card-link" onClick={(e) => { e.stopPropagation(); navigate(ROUTES.TASKS) }}>
          {total} {total === 1 ? 'משימה' : 'משימות'}
          <ChevronLeft size={16} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
      {open ? (
        <div className="h-card-list">
          {items.length ? (
            items.map((t) => (
              <div
                key={t.id}
                className="h-task-row"
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); navigate(ROUTES.TASKS) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate(ROUTES.TASKS) } }}
              >
                <span className="h-task-content">
                  <span className={`h-task-dot ${t.priority === 'high' ? 'urgent' : 'regular'}`} />
                  <span className="h-task-text">{t.title}</span>
                </span>
                <button type="button" className="h-check" title="סמן כבוצע" aria-label="סמן כבוצע" onClick={(e) => { e.stopPropagation(); toggleTask(t) }}>
                  <Check size={13} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            ))
          ) : (
            <p className="h-card-empty">כל המשימות בוצעו. {addr({male:'הוסף',female:'הוסיפי',neutral:'הוסף/י'})} משימה כשנהיה צורך.</p>
          )}
        </div>
      ) : (
        <p className="h-card-summary">{summary}</p>
      )}
    </div>
  )
}
