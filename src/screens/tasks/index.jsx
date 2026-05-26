import { useMemo, useState } from 'react'
import { useTasks } from '../../hooks/useTasks'
import { useProjects } from '../../hooks/useProjects'
import { useClients } from '../../hooks/useClients'
import TaskItem from './TaskItem'
import AddTaskModal from '../../modals/AddTaskModal'
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

export default function TasksScreen() {
  const { tasks, loading, addTask, toggleTask } = useTasks()
  const { projects } = useProjects()
  const { clients } = useClients()
  const [filter, setFilter] = useState('todo')
  const [showAdd, setShowAdd] = useState(false)

  const openCount = tasks.filter((t) => t.status !== 'done').length
  const doneCount = tasks.filter((t) => t.status === 'done').length
  const urgentCount = tasks.filter((t) => t.status !== 'done' && t.priority === 'high').length

  const filtered = useMemo(() => {
    if (filter === 'todo') return tasks.filter((t) => t.status !== 'done')
    if (filter === 'done') return tasks.filter((t) => t.status === 'done')
    return tasks
  }, [tasks, filter])

  const projOf = (id) => projects.find((p) => p.id === id)
  const clientNameOf = (id) => clients.find((c) => c.id === id)?.name

  return (
    <div className="screen">
      <div className="screen-top">
        <header className="screen-head">
          <div>
            <div className="screen-head-meta">
              <p className="lbl">{openCount} פתוחות</p>
              <span className="lbl dot">·</span>
              <p className="lbl">{doneCount} הושלמו</p>
            </div>
            <p className="lbl-sm">עשה/י את הצעד הבא.</p>
          </div>
          <p className="t-screen">משימות</p>
        </header>
        <button className="cta-add" type="button" aria-label="הוסף משימה" onClick={() => setShowAdd(true)}>הוסף משימה +</button>
      </div>

      <section className="t-hero">
        <div className="s-hero">
          <p className="t-hero-title">סיכום משימות</p>
          <div className="t-hero-grid">
            <div className="t-hero-stat">
              <p className="t-hero-stat-l">פתוחות</p>
              <p className="t-hero-stat-v mono">{openCount}</p>
            </div>
            <div className="t-hero-stat divided">
              <p className="t-hero-stat-l">דחופות</p>
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
        {FILTERS.map((f) => (
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
          <div className="empty"><p className="empty-text">טוען משימות…</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <p className="empty-text">{filter === 'done' ? 'עוד לא הושלמו משימות.' : 'אין משימות פתוחות. כל הכבוד!'}</p>
          </div>
        ) : (
          PRIORITY_GROUPS.map((g) => {
            const items = filtered.filter((t) => (t.priority || 'medium') === g.key)
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
        )}
      </section>

      <AddTaskModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        projects={projects}
        clients={clients}
        onSave={addTask}
      />
    </div>
  )
}
