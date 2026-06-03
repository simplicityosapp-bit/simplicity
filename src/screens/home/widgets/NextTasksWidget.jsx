import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, ChevronLeft, Check } from 'lucide-react'
import { ROUTES } from '../../../lib/routes'
import { nextTasks, openTasksCount } from '../../../lib/homeData'
import { useTasks } from '../../../hooks/useTasks'

/* Next 3-5 open tasks by priority. Row → tasks screen; the ✓ marks done. */
export default function NextTasksWidget() {
  const navigate = useNavigate()
  const { tasks, toggleTask } = useTasks()
  const items = useMemo(() => nextTasks(5, tasks), [tasks])
  const total = useMemo(() => openTasksCount(tasks), [tasks])

  return (
    <div className="h-card">
      <div className="h-card-head">
        <span className="h-card-title">
          <ClipboardList size={20} strokeWidth={1.5} aria-hidden="true" /> המשימות הבאות
        </span>
        <button type="button" className="h-card-link" onClick={() => navigate(ROUTES.TASKS)}>
          {total} {total === 1 ? 'פעולה' : 'פעולות'}
          <ChevronLeft size={16} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
      <div className="h-card-list">
        {items.length ? (
          items.map((t) => (
            <div key={t.id} className="h-task-row" onClick={() => navigate(ROUTES.TASKS)}>
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
          <p className="h-card-empty">כל המשימות בוצעו. הוסף/י משימה כשנהיה צורך.</p>
        )}
      </div>
    </div>
  )
}
