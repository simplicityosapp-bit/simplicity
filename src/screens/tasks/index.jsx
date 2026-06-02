import { useEffect, useMemo, useState } from 'react'
import { ListTodo, Plus } from 'lucide-react'
import { useTasks } from '../../hooks/useTasks'
import { useReminders } from '../../hooks/useReminders'
import { useProjects } from '../../hooks/useProjects'
import { useClients } from '../../hooks/useClients'
import TaskItem from './TaskItem'
import ReminderItem from './ReminderItem'
import AddTaskModal from '../../modals/AddTaskModal'
import AddReminderModal from '../../modals/AddReminderModal'
import Coachmark from '../../components/Coachmark'
import { coachmarkText } from '../../lib/coachmarks'
import { isRecurring, isActiveReminder, dueOccurrenceCount } from '../../lib/reminders'
import './TasksScreen.css'

const PRIORITY_COLOR = {
  high: 'var(--clay)',
  medium: 'var(--amber-warn)',
  low: 'var(--sage)',
}
const PRIORITY_GROUPS = [
  { key: 'high', label: 'דחוף' },
  { key: 'medium', label: 'רגיל' },
  { key: 'low', label: 'נמוך' },
]
const FILTERS = [
  { key: 'todo', label: 'פתוחות' },
  { key: 'done', label: 'הושלמו' },
  { key: 'all', label: 'הכל' },
]
/* Reminders get their own tabs: open vs the recurring schedule. */
const REM_FILTERS = [
  { key: 'todo', label: 'פתוחות' },
  { key: 'recurring', label: 'חוזרות' },
]
const HEB_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

/* Date buckets used to group reminders the same way tasks are grouped
   by priority — keeps the visual rhythm identical between the two
   modes. Buckets are computed against now; "overdue" only includes
   pending reminders, never completed ones. */
const REM_BUCKETS = [
  { key: 'overdue', label: 'באיחור', color: 'var(--clay)' },
  { key: 'today',   label: 'היום',   color: 'var(--amber-warn)' },
  { key: 'week',    label: 'השבוע',  color: 'var(--sage)' },
  { key: 'later',   label: 'מאוחר יותר', color: 'var(--mist)' },
]

function reminderBucket(rem, now) {
  if (rem.status === 'completed') return null
  const due = new Date(rem.scheduled_at)
  if (due < now) return 'overdue'
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7)
  if (due < tomorrow) return 'today'
  if (due < weekEnd)  return 'week'
  return 'later'
}

export default function TasksScreen() {
  const { tasks, loading: tasksLoading, error: tasksError, addTask, toggleTask } = useTasks()
  const { reminders, loading: remindersLoading, error: remindersError, addReminder, completeReminder } = useReminders()
  const { projects } = useProjects()
  const { clients } = useClients()
  /* Top toggle drives entity choice. The rest of the screen reads
     from the active hook and renders the same chrome (header counts,
     hero stats, filter, list). */
  const [view, setView] = useState('tasks')
  const [filter, setFilter] = useState('todo')
  const [showAdd, setShowAdd] = useState(false)

  const isTasks = view === 'tasks'
  /* Reset to the "open" tab when flipping views (the other tabs differ). */
  useEffect(() => { setFilter('todo') }, [view])
  const filters = isTasks ? FILTERS : REM_FILTERS
  const loading = isTasks ? tasksLoading : remindersLoading
  const error = isTasks ? tasksError : remindersError

  /* Counts for the header + hero ─ both entities share a pending/done
     contract so we can derive them with a single .status check. */
  const openCount  = isTasks
    ? tasks.filter((t) => t.status !== 'done').length
    : reminders.filter((r) => r.status !== 'completed').length
  const doneCount  = isTasks
    ? tasks.filter((t) => t.status === 'done').length
    : reminders.filter((r) => r.status === 'completed').length
  const now = useMemo(() => new Date(), [reminders, filter])
  /* "Urgent" tile re-labels per entity: tasks use priority=high, while
     reminders use overdue (past due AND still pending). */
  const urgentCount = isTasks
    ? tasks.filter((t) => t.status !== 'done' && t.priority === 'high').length
    : reminders.filter((r) => r.status !== 'completed' && new Date(r.scheduled_at) < now).length

  const filteredTasks = useMemo(() => {
    if (filter === 'todo') return tasks.filter((t) => t.status !== 'done')
    if (filter === 'done') return tasks.filter((t) => t.status === 'done')
    return tasks
  }, [tasks, filter])

  const filteredReminders = useMemo(() => {
    /* "פתוחות" = open one-off + recurring whose occurrence has come due. */
    return reminders.filter((r) => {
      if (!isActiveReminder(r)) return false
      return isRecurring(r) ? dueOccurrenceCount(r, now) >= 1 : true
    })
  }, [reminders, now])

  /* "חוזרות" tab — all active recurring reminders, grouped: weekly by
     day-of-week, monthly together, every-X-days together. */
  const recurringGroups = useMemo(() => {
    if (isTasks) return []
    const rec = reminders.filter((r) => isRecurring(r) && isActiveReminder(r))
    const groups = []
    for (let d = 0; d < 7; d++) {
      const items = rec.filter((r) => r.recurrence_type === 'weekly' && r.recurrence_pattern?.dayOfWeek === d)
      if (items.length) groups.push({ key: `w${d}`, label: `יום ${HEB_DAYS[d]}`, color: 'var(--sage)', items })
    }
    const monthly = rec.filter((r) => r.recurrence_type === 'monthly_date')
    if (monthly.length) groups.push({ key: 'monthly', label: 'חודשי', color: 'var(--moon-deep)', items: monthly })
    const everyX = rec.filter((r) => r.recurrence_type === 'every_x_days')
    if (everyX.length) groups.push({ key: 'everyx', label: 'כל כמה ימים', color: 'var(--clay)', items: everyX })
    return groups
  }, [reminders, isTasks])

  const projOf = (id) => projects.find((p) => p.id === id)
  const clientNameOf = (id) => clients.find((c) => c.id === id)?.name

  const emptyMsg = isTasks
    ? (filter === 'done' ? 'עוד לא הושלמו משימות.' : 'אין משימות פתוחות. כל הכבוד!')
    : (filter === 'done' ? 'עוד לא הושלמו תזכורות.' : 'אין תזכורות פתוחות. הכל רגוע.')

  return (
    <div className="screen">
      <div className="screen-top">
        <header className="screen-head">
          <div>
            <div className="screen-head-meta">
              <p className="lbl">{openCount} {isTasks ? 'פתוחות' : 'תזכורות'}</p>
              <span className="lbl dot">·</span>
              <p className="lbl">{doneCount} הושלמו</p>
            </div>
            <p className="lbl-sm">עשה/י את הצעד הבא.</p>
          </div>
          <p className="t-screen">{isTasks ? 'משימות' : 'תזכורות'}</p>
        </header>
        <Coachmark id="add-task" radius="50%">
          <button
            className="cta-add"
            type="button"
            aria-label={isTasks ? 'הוסף משימה' : 'הוסף תזכורת'}
            onClick={() => setShowAdd(true)}
          >
            {isTasks ? 'הוסף משימה +' : 'הוסף תזכורת +'}
          </button>
        </Coachmark>
      </div>

      {/* Entity toggle — same role as Leads' kanban/statuses switcher,
          rendered below screen-top so it doesn't break the centered
          "+" slot. */}
      <div className="mg-toggle t-view" role="tablist" aria-label="תצוגה">
        <button
          type="button"
          className={`mg-toggle-btn${view === 'tasks' ? ' on' : ''}`}
          onClick={() => setView('tasks')}
          role="tab"
          aria-selected={view === 'tasks'}
        >
          משימות
        </button>
        <button
          type="button"
          className={`mg-toggle-btn${view === 'reminders' ? ' on' : ''}`}
          onClick={() => setView('reminders')}
          role="tab"
          aria-selected={view === 'reminders'}
        >
          תזכורות
        </button>
      </div>

      <section className="t-hero">
        <div className="s-hero">
          <p className="t-hero-title">{isTasks ? 'סיכום משימות' : 'סיכום תזכורות'}</p>
          <div className="t-hero-grid">
            <div className="t-hero-stat">
              <p className="t-hero-stat-l">פתוחות</p>
              <p className="t-hero-stat-v mono">{openCount}</p>
            </div>
            <div className="t-hero-stat divided">
              <p className="t-hero-stat-l">{isTasks ? 'דחופות' : 'באיחור'}</p>
              <p className="t-hero-stat-v mono">{urgentCount}</p>
            </div>
            <div className="t-hero-stat">
              <p className="t-hero-stat-l">הושלמו</p>
              <p className="t-hero-stat-v mono">{doneCount}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mg-toggle t-filter" role="tablist" aria-label="סינון לפי סטטוס">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`mg-toggle-btn${filter === f.key ? ' on' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <section className="t-list">
        {loading ? (
          <div className="empty"><p className="empty-text">{isTasks ? 'טוען משימות…' : 'טוען תזכורות…'}</p></div>
        ) : error ? (
          <div className="empty"><p className="empty-text">{isTasks ? 'שגיאה בטעינת המשימות' : 'שגיאה בטעינת התזכורות'}: {error}</p></div>
        ) : isTasks ? (
          filteredTasks.length === 0 ? (
            tasks.length === 0 ? (
              <div className="empty">
                <span className="empty-icon"><ListTodo size={28} strokeWidth={1.4} aria-hidden="true" /></span>
                <p className="empty-text">אין עדיין משימות. המשימה הראשונה שלכם מתחילה כאן.</p>
                <button className="empty-action" type="button" onClick={() => setShowAdd(true)}>
                  <Plus size={18} strokeWidth={1.8} aria-hidden="true" /> הוסיפו משימה
                </button>
                <details className="empty-reminder">
                  <summary>למה זה חשוב?</summary>
                  <p className="empty-reminder-body">{coachmarkText('add-task').detail}</p>
                </details>
              </div>
            ) : (
              <div className="empty"><p className="empty-text">{emptyMsg}</p></div>
            )
          ) : (
            PRIORITY_GROUPS.map((g) => {
              const items = filteredTasks.filter((t) => (t.priority || 'medium') === g.key)
              if (!items.length) return null
              return (
                <div key={g.key} className="t-group">
                  <p className="t-group-lbl">
                    <span className="t-group-dot" style={{ background: PRIORITY_COLOR[g.key] }} />
                    {g.label}
                    <span className="t-group-count">{items.length}</span>
                  </p>
                  {items.map((t, i) => (
                    <TaskItem
                      key={t.id}
                      task={t}
                      project={projOf(t.project_id)}
                      clientName={clientNameOf(t.client_id)}
                      dotColor={PRIORITY_COLOR[t.priority || 'medium']}
                      onToggle={() => toggleTask(t)}
                      index={i}
                    />
                  ))}
                </div>
              )
            })
          )
        ) : (
          filter === 'recurring' ? (
            /* "חוזרות" — recurring schedule grouped by weekday / monthly. */
            recurringGroups.length === 0 ? (
              <div className="empty"><p className="empty-text">אין תזכורות חוזרות עדיין.</p></div>
            ) : (
              recurringGroups.map((g) => (
                <div key={g.key} className="t-group">
                  <p className="t-group-lbl">
                    <span className="t-group-dot" style={{ background: g.color }} />
                    {g.label}
                    <span className="t-group-count">{g.items.length}</span>
                  </p>
                  {g.items.map((r, i) => (
                    <ReminderItem
                      key={r.id}
                      reminder={r}
                      clientName={clientNameOf(r.client_id)}
                      dotColor={g.color}
                      onComplete={completeReminder}
                      index={i}
                    />
                  ))}
                </div>
              ))
            )
          ) : filteredReminders.length === 0 ? (
            <div className="empty"><p className="empty-text">אין תזכורות פתוחות. הכל רגוע.</p></div>
          ) : (
            REM_BUCKETS.map((b) => {
              const items = filteredReminders.filter((r) => reminderBucket(r, now) === b.key)
              if (!items.length) return null
              return (
                <div key={b.key} className="t-group">
                  <p className="t-group-lbl">
                    <span className="t-group-dot" style={{ background: b.color }} />
                    {b.label}
                    <span className="t-group-count">{items.length}</span>
                  </p>
                  {items.map((r, i) => (
                    <ReminderItem
                      key={r.id}
                      reminder={r}
                      clientName={clientNameOf(r.client_id)}
                      dotColor={b.color}
                      onComplete={completeReminder}
                      count={dueOccurrenceCount(r, now)}
                      index={i}
                    />
                  ))}
                </div>
              )
            })
          )
        )}
      </section>

      {isTasks ? (
        <AddTaskModal
          open={showAdd}
          onClose={() => setShowAdd(false)}
          projects={projects}
          clients={clients}
          onSave={addTask}
        />
      ) : (
        <AddReminderModal
          open={showAdd}
          onClose={() => setShowAdd(false)}
          clients={clients}
          onSave={addReminder}
        />
      )}
    </div>
  )
}
