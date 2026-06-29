import { useMemo, useState } from 'react'
import { ListTodo, Plus, Trash2, Tags, ChevronDown } from 'lucide-react'
import { useTasks } from '../../hooks/useTasks'
import { useReminders } from '../../hooks/useReminders'
import { useProjects } from '../../hooks/useProjects'
import { useClients } from '../../hooks/useClients'
import { useTaskStatuses } from '../../hooks/useTaskStatuses'
import { useTaskCategories } from '../../hooks/useTaskCategories'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useT } from '../../i18n/useT'
import TaskItem from './TaskItem'
import ReminderItem from './ReminderItem'
import AddTaskModal from '../../modals/AddTaskModal'
import AddReminderModal from '../../modals/AddReminderModal'
import ConfirmModal from '../../modals/ConfirmModal'
import TaskTaxonomyModal from '../../modals/TaskTaxonomyModal'
import Coachmark from '../../components/Coachmark'
import { coachmarkText } from '../../lib/coachmarks'
import { isRecurring, isActiveReminder, dueOccurrenceCount } from '../../lib/reminders'
import { formatWhen } from '../../lib/dates'
import { reassignTasksStatus } from '../../lib/api/taskStatuses'
import { reassignTasksCategory } from '../../lib/api/taskCategories'
import './TasksScreen.css'

const PRIORITY_COLOR = {
  high: 'var(--clay)',
  medium: 'var(--amber-warn)',
  low: 'var(--sage)',
}
/* Group/filter keys; their labels are resolved via t() at render time
   (the constants live at module scope where t isn't available). */
const PRIORITY_GROUPS = ['high', 'medium', 'low']
const FILTERS = ['todo', 'done', 'all']
/* How the task list is grouped (collapsible sections). Priority is the
   default (preserves the original layout); project/category let the user
   re-slice the same tasks. */
const GROUP_BY = ['priority', 'project', 'category']
const GROUP_FALLBACK_COLOR = 'var(--mist)'
/* Reminders get their own tabs: open, the recurring schedule, and completed. */
const REM_FILTERS = ['todo', 'recurring', 'done']

/* Date buckets used to group reminders the same way tasks are grouped
   by priority — keeps the visual rhythm identical between the two
   modes. Buckets are computed against now; "overdue" only includes
   pending reminders, never completed ones. */
const REM_BUCKETS = [
  { key: 'overdue', color: 'var(--clay)' },
  { key: 'today',   color: 'var(--amber-warn)' },
  { key: 'week',    color: 'var(--sage)' },
  { key: 'later',   color: 'var(--mist)' },
]

/* Map a due Date → bucket key against now. Shared by reminders and dated
   tasks so both land in the same overdue/today/week/later sections. */
function dateToBucket(due, now) {
  if (Number.isNaN(+due)) return null
  if (due < now) return 'overdue'
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7)
  if (due < tomorrow) return 'today'
  if (due < weekEnd)  return 'week'
  return 'later'
}

function reminderBucket(rem, now) {
  if (rem.status === 'completed') return null
  return dateToBucket(new Date(rem.scheduled_at), now)
}

/* A dated, still-open task surfaces on the reminders view in its due bucket. */
function taskDueBucket(task, now) {
  if (!task.due_at || task.status === 'done') return null
  return dateToBucket(new Date(task.due_at), now)
}

export default function TasksScreen() {
  const { t } = useT('tasks')
  const { prefs } = useUserPreferences()
  const gender = prefs?.design?.gender
  const { tasks, loading: tasksLoading, error: tasksError, addTask, toggleTask, editTask, clearCompleted, refetch: refetchTasks } = useTasks()
  const { reminders, loading: remindersLoading, error: remindersError, addReminder, completeReminder, editReminder, clearCompleted: clearCompletedReminders } = useReminders()
  const { projects } = useProjects()
  const { clients } = useClients()
  const { statuses: taskStatuses, addStatus, removeStatus } = useTaskStatuses()
  const { categories: taskCategories, addCategory, removeCategory } = useTaskCategories()
  /* Top toggle drives entity choice. The rest of the screen reads
     from the active hook and renders the same chrome (header counts,
     hero stats, filter, list). */
  const [view, setView] = useState('tasks')
  const [filter, setFilter] = useState('todo')
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [showTaxonomy, setShowTaxonomy] = useState(false)
  /* A dated task tapped from the reminders view opens its own task editor,
     independent of the reminders edit state (different entity + modal). */
  const [editDatedTask, setEditDatedTask] = useState(null)
  /* Multi-select category filter — empty set = all categories. Several pills
     can be active at once (a task shows if its category is in the set). */
  const [categoryFilters, setCategoryFilters] = useState(() => new Set())
  const toggleCategoryFilter = (id) => setCategoryFilters((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const [groupBy, setGroupBy] = useState('priority')
  const [collapsed, setCollapsed] = useState(() => new Set()) /* collapsed group keys */
  const toggleGroup = (key) => setCollapsed((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  const statusById = useMemo(() => {
    const m = new Map(); taskStatuses.forEach((s) => m.set(s.id, s)); return m
  }, [taskStatuses])
  const categoryById = useMemo(() => {
    const m = new Map(); taskCategories.forEach((c) => m.set(c.id, c)); return m
  }, [taskCategories])

  /* Deleting a status/category first clears the link on any task using it
     (the task survives, falling back to its meta / "no category"), then
     soft-deletes the taxonomy row, then refreshes the task list. */
  const handleRemoveStatus = async (id) => {
    try { await reassignTasksStatus(id, null) } catch { /* non-fatal */ }
    await removeStatus(id)
    refetchTasks()
  }
  const handleRemoveCategory = async (id) => {
    try { await reassignTasksCategory(id, null) } catch { /* non-fatal */ }
    await removeCategory(id)
    refetchTasks()
  }

  const isTasks = view === 'tasks'
  /* Flip view + reset the filter tab and any in-progress edit. Done in the
     handler (not an effect) to avoid a cascading set-state-in-effect. */
  const switchView = (v) => { setView(v); setFilter('todo'); setEditItem(null) }
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
  const now = useMemo(() => new Date(), [reminders, filter, view])
  /* "Urgent" tile re-labels per entity: tasks use priority=high, while
     reminders use overdue (past due AND still pending). */
  const urgentCount = isTasks
    ? tasks.filter((t) => t.status !== 'done' && t.priority === 'high').length
    : reminders.filter((r) => r.status !== 'completed' && new Date(r.scheduled_at) < now).length

  const filteredTasks = useMemo(() => {
    let list = tasks
    if (filter === 'todo') list = list.filter((t) => t.status !== 'done')
    else if (filter === 'done') list = list.filter((t) => t.status === 'done')
    if (categoryFilters.size) list = list.filter((t) => categoryFilters.has(t.category_id))
    return list
  }, [tasks, filter, categoryFilters])

  /* Build collapsible groups for the filtered tasks per the chosen groupBy.
     Priority keeps the original fixed order; project/category order follows
     the user's own project/category list, with an "unassigned" bucket last. */
  const taskGroups = useMemo(() => {
    if (groupBy === 'project') {
      const groups = projects.map((p) => ({
        key: `p-${p.id}`,
        label: p.name,
        color: p.color || GROUP_FALLBACK_COLOR,
        items: filteredTasks.filter((task) => task.project_id === p.id),
      }))
      const none = filteredTasks.filter((task) => !task.project_id || !projects.some((p) => p.id === task.project_id))
      if (none.length) groups.push({ key: 'p-none', label: t('groupBy.noProject'), color: GROUP_FALLBACK_COLOR, items: none })
      return groups.filter((g) => g.items.length)
    }
    if (groupBy === 'category') {
      const groups = taskCategories.map((c) => ({
        key: `c-${c.id}`,
        label: c.name,
        color: c.color || GROUP_FALLBACK_COLOR,
        items: filteredTasks.filter((task) => task.category_id === c.id),
      }))
      const none = filteredTasks.filter((task) => !task.category_id || !taskCategories.some((c) => c.id === task.category_id))
      if (none.length) groups.push({ key: 'c-none', label: t('groupBy.noCategory'), color: GROUP_FALLBACK_COLOR, items: none })
      return groups.filter((g) => g.items.length)
    }
    /* default: priority */
    return PRIORITY_GROUPS
      .map((g) => ({
        key: `pri-${g}`,
        label: t(`priority.${g}`),
        color: PRIORITY_COLOR[g],
        items: filteredTasks.filter((task) => (task.priority || 'medium') === g),
      }))
      .filter((g) => g.items.length)
  }, [groupBy, filteredTasks, projects, taskCategories, t])

  const filteredReminders = useMemo(() => {
    if (filter === 'done') return reminders.filter((r) => r.status === 'completed')
    /* "פתוחות" = open one-off + recurring whose occurrence has come due. */
    return reminders.filter((r) => {
      if (!isActiveReminder(r)) return false
      return isRecurring(r) ? dueOccurrenceCount(r, now) >= 1 : true
    })
  }, [reminders, now, filter])

  /* Dated tasks that "pop" onto the reminders view — open tasks with a due_at,
     shown only on the open ("פתוחות") tab, bucketed by their due date. */
  const datedTasks = useMemo(() => (
    (view === 'reminders' && filter === 'todo')
      ? tasks.filter((task) => task.due_at && task.status !== 'done')
      : []
  ), [view, filter, tasks])

  /* "חוזרות" tab — all active recurring reminders, grouped: weekly by
     day-of-week, monthly together, every-X-days together. */
  const recurringGroups = useMemo(() => {
    if (isTasks) return []
    const rec = reminders.filter((r) => isRecurring(r) && isActiveReminder(r))
    const groups = []
    for (let d = 0; d < 7; d++) {
      const items = rec.filter((r) => r.recurrence_type === 'weekly' && r.recurrence_pattern?.dayOfWeek === d)
      if (items.length) groups.push({ key: `w${d}`, label: t('recurring.weekday', { day: t(`days.${d}`) }), color: 'var(--sage)', items })
    }
    const monthly = rec.filter((r) => r.recurrence_type === 'monthly_date')
    if (monthly.length) groups.push({ key: 'monthly', label: t('recurring.monthly'), color: 'var(--moon-deep)', items: monthly })
    const everyX = rec.filter((r) => r.recurrence_type === 'every_x_days')
    if (everyX.length) groups.push({ key: 'everyx', label: t('recurring.everyXDays'), color: 'var(--clay)', items: everyX })
    return groups
  }, [reminders, isTasks, t])

  const projOf = (id) => projects.find((p) => p.id === id)
  const clientNameOf = (id) => clients.find((c) => c.id === id)?.name

  const emptyMsg = isTasks
    ? (filter === 'done' ? t('empty.tasksDone') : t('empty.tasksTodo'))
    : (filter === 'done' ? t('empty.remindersDone') : t('empty.remindersTodo'))

  return (
    <div className="screen">
      <div className="screen-top">
        <header className="screen-head">
          <div>
            <div className="screen-head-meta">
              <p className="lbl">{isTasks ? t('meta.open', { n: openCount }) : t('meta.openReminders', { n: openCount })}</p>
              <span className="lbl dot">·</span>
              <p className="lbl">{t('meta.done', { n: doneCount })}</p>
            </div>
            <p className="lbl-sm">{t('tagline')}</p>
          </div>
          <p className="t-screen">{isTasks ? t('tasks') : t('reminders')}</p>
        </header>
        <Coachmark id="add-task" radius="50%">
          <button
            className="cta-add"
            type="button"
            aria-label={isTasks ? t('add.taskAria') : t('add.reminderAria')}
            onClick={() => setShowAdd(true)}
          >
            {isTasks ? t('add.task') : t('add.reminder')}
          </button>
        </Coachmark>
      </div>

      {/* Entity toggle — same role as Leads' kanban/statuses switcher,
          rendered below screen-top so it doesn't break the centered
          "+" slot. */}
      <div className="mg-toggle t-view" role="tablist" aria-label={t('view.aria')}>
        <button
          type="button"
          className={`mg-toggle-btn${view === 'tasks' ? ' on' : ''}`}
          onClick={() => switchView('tasks')}
          role="tab"
          aria-selected={view === 'tasks'}
        >
          {t('tasks')}
        </button>
        <button
          type="button"
          className={`mg-toggle-btn${view === 'reminders' ? ' on' : ''}`}
          onClick={() => switchView('reminders')}
          role="tab"
          aria-selected={view === 'reminders'}
        >
          {t('reminders')}
        </button>
      </div>

      <section className="t-hero">
        <div className="s-hero">
          <p className="t-hero-title">{isTasks ? t('hero.tasksTitle') : t('hero.remindersTitle')}</p>
          <div className="t-hero-grid">
            <div className="t-hero-stat">
              <p className="t-hero-stat-l">{t('hero.open')}</p>
              <p className="t-hero-stat-v mono">{openCount}</p>
            </div>
            <div className="t-hero-stat divided">
              <p className="t-hero-stat-l">{isTasks ? t('hero.urgentTasks') : t('hero.overdueReminders')}</p>
              <p className="t-hero-stat-v mono">{urgentCount}</p>
            </div>
            <div className="t-hero-stat">
              <p className="t-hero-stat-l">{t('hero.done')}</p>
              <p className="t-hero-stat-v mono">{doneCount}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mg-toggle t-filter" role="tablist" aria-label={t('filter.aria')}>
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            className={`mg-toggle-btn${filter === f ? ' on' : ''}`}
            onClick={() => setFilter(f)}
            role="tab"
            aria-selected={filter === f}
          >
            {t(`filter.${f}`)}
          </button>
        ))}
      </div>

      {isTasks && (
        <div className="mg-toggle t-groupby" role="tablist" aria-label={t('groupBy.aria')}>
          {GROUP_BY.map((gb) => (
            <button
              key={gb}
              type="button"
              className={`mg-toggle-btn${groupBy === gb ? ' on' : ''}`}
              onClick={() => setGroupBy(gb)}
              role="tab"
              aria-selected={groupBy === gb}
            >
              {t(`groupBy.${gb}`)}
            </button>
          ))}
        </div>
      )}

      {isTasks && (
        <div className="t-tax-bar">
          {taskCategories.length > 0 ? (
            <div className="t-cat-filter">
              <button type="button" className={`t-cat-pill${categoryFilters.size === 0 ? ' on' : ''}`} onClick={() => setCategoryFilters(new Set())}>{t('taxonomy.all')}</button>
              {taskCategories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`t-cat-pill${categoryFilters.has(c.id) ? ' on' : ''}`}
                  aria-pressed={categoryFilters.has(c.id)}
                  onClick={() => toggleCategoryFilter(c.id)}
                >
                  <span className="t-cat-dot" style={{ background: c.color || 'var(--stone)' }} />
                  {c.name}
                </button>
              ))}
            </div>
          ) : <span />}
          <button type="button" className="t-manage-btn" onClick={() => setShowTaxonomy(true)}>
            <Tags size={14} strokeWidth={1.5} aria-hidden="true" />
            {t('taxonomy.manage')}
          </button>
        </div>
      )}

      {filter === 'done' && doneCount > 0 && (
        <div className="t-clear-row">
          <button type="button" className="t-clear-btn" onClick={() => setConfirmClear(true)}>
            <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
            {t('clearAll')}
          </button>
        </div>
      )}

      <section className="t-list">
        {loading ? (
          <div className="empty"><p className="empty-text">{isTasks ? t('loading.tasks') : t('loading.reminders')}</p></div>
        ) : error ? (
          <div className="empty"><p className="empty-text">{isTasks ? t('loadError.tasks', { error }) : t('loadError.reminders', { error })}</p></div>
        ) : isTasks ? (
          filteredTasks.length === 0 ? (
            tasks.length === 0 ? (
              <div className="empty">
                <span className="empty-icon"><ListTodo size={28} strokeWidth={1.5} aria-hidden="true" /></span>
                <p className="empty-text">{t('empty.firstTask')}</p>
                <button className="empty-action" type="button" onClick={() => setShowAdd(true)}>
                  <Plus size={18} strokeWidth={1.5} aria-hidden="true" /> {t('empty.addTask')}
                </button>
                <details className="empty-reminder">
                  <summary>{t('empty.whyImportant')}</summary>
                  <p className="empty-reminder-body">{coachmarkText('add-task', gender).detail}</p>
                </details>
              </div>
            ) : (
              <div className="empty"><p className="empty-text">{emptyMsg}</p></div>
            )
          ) : (
            taskGroups.map((g) => {
              const isCollapsed = collapsed.has(g.key)
              return (
                <div key={g.key} className={`t-group t-group-card${isCollapsed ? '' : ' open'}`}>
                  <button
                    type="button"
                    className="t-group-lbl t-group-toggle"
                    onClick={() => toggleGroup(g.key)}
                    aria-expanded={!isCollapsed}
                  >
                    <span className="t-group-dot" style={{ background: g.color }} />
                    {g.label}
                    <span className="t-group-count">{g.items.length}</span>
                    <ChevronDown size={14} strokeWidth={1.6} className={`t-group-chev${isCollapsed ? '' : ' open'}`} aria-hidden="true" />
                  </button>
                  {!isCollapsed && (
                    <div className="t-group-body">
                      {g.items.map((task, i) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          project={projOf(task.project_id)}
                          clientName={clientNameOf(task.client_id)}
                          dotColor={PRIORITY_COLOR[task.priority || 'medium']}
                          onToggle={() => toggleTask(task)}
                          onEdit={setEditItem}
                          index={i}
                          taskStatus={task.status_id ? statusById.get(task.status_id) : null}
                          category={task.category_id ? categoryById.get(task.category_id) : null}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )
        ) : (
          filter === 'recurring' ? (
            /* "חוזרות" — recurring schedule grouped by weekday / monthly. */
            recurringGroups.length === 0 ? (
              <div className="empty"><p className="empty-text">{t('empty.noRecurring')}</p></div>
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
                      onEdit={setEditItem}
                      index={i}
                    />
                  ))}
                </div>
              ))
            )
          ) : (filteredReminders.length === 0 && datedTasks.length === 0) ? (
            <div className="empty"><p className="empty-text">{filter === 'done' ? t('empty.remindersDone') : t('empty.remindersTodo')}</p></div>
          ) : filter === 'done' ? (
            <div className="t-group">
              <p className="t-group-lbl">
                <span className="t-group-dot" style={{ background: 'var(--stone)' }} />
                {t('doneGroup')}
                <span className="t-group-count">{filteredReminders.length}</span>
              </p>
              {filteredReminders.map((r, i) => (
                <ReminderItem
                  key={r.id}
                  reminder={r}
                  clientName={clientNameOf(r.client_id)}
                  dotColor="var(--stone)"
                  onComplete={completeReminder}
                  onEdit={setEditItem}
                  index={i}
                />
              ))}
            </div>
          ) : (
            REM_BUCKETS.map((b) => {
              const items = filteredReminders.filter((r) => reminderBucket(r, now) === b.key)
              const dueTasks = datedTasks.filter((task) => taskDueBucket(task, now) === b.key)
              if (!items.length && !dueTasks.length) return null
              return (
                <div key={b.key} className="t-group">
                  <p className="t-group-lbl">
                    <span className="t-group-dot" style={{ background: b.color }} />
                    {t(`buckets.${b.key}`)}
                    <span className="t-group-count">{items.length + dueTasks.length}</span>
                  </p>
                  {items.map((r, i) => (
                    <ReminderItem
                      key={r.id}
                      reminder={r}
                      clientName={clientNameOf(r.client_id)}
                      dotColor={b.color}
                      onComplete={completeReminder}
                      onEdit={setEditItem}
                      count={dueOccurrenceCount(r, now)}
                      index={i}
                    />
                  ))}
                  {/* Dated tasks pop in here, distinguished by the task check-circle. */}
                  {dueTasks.map((task, i) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      project={projOf(task.project_id)}
                      clientName={clientNameOf(task.client_id)}
                      dueLabel={formatWhen(task.due_at)}
                      dotColor={b.color}
                      onToggle={() => toggleTask(task)}
                      onEdit={setEditDatedTask}
                      index={items.length + i}
                      taskStatus={task.status_id ? statusById.get(task.status_id) : null}
                      category={task.category_id ? categoryById.get(task.category_id) : null}
                    />
                  ))}
                </div>
              )
            })
          )
        )}
      </section>

      {/* Edit a dated task tapped from the reminders view — its own task modal,
          rendered regardless of the active view. */}
      <AddTaskModal
        key={editDatedTask?.id || 'edit-dated-task'}
        open={!!editDatedTask}
        onClose={() => setEditDatedTask(null)}
        task={editDatedTask}
        projects={projects}
        clients={clients}
        statuses={taskStatuses}
        categories={taskCategories}
        onSave={(patch) => editDatedTask && editTask(editDatedTask.id, patch)}
      />

      {isTasks ? (
        <>
          <AddTaskModal
            open={showAdd}
            onClose={() => setShowAdd(false)}
            projects={projects}
            clients={clients}
            statuses={taskStatuses}
            categories={taskCategories}
            onSave={addTask}
          />
          <AddTaskModal
            key={editItem?.id || 'edit-task'}
            open={!!editItem}
            onClose={() => setEditItem(null)}
            task={editItem}
            projects={projects}
            clients={clients}
            statuses={taskStatuses}
            categories={taskCategories}
            onSave={(patch) => editItem && editTask(editItem.id, patch)}
          />
          <ConfirmModal
            open={confirmClear}
            onClose={() => setConfirmClear(false)}
            title={t('clearConfirm.tasksTitle')}
            message={doneCount === 1 ? t('clearConfirm.tasksMessageOne') : t('clearConfirm.tasksMessageMany', { count: doneCount })}
            confirmLabel={t('clearConfirm.confirm')}
            danger
            onConfirm={() => clearCompleted()}
          />
          <TaskTaxonomyModal
            open={showTaxonomy}
            onClose={() => setShowTaxonomy(false)}
            statuses={taskStatuses}
            categories={taskCategories}
            onAddStatus={addStatus}
            onRemoveStatus={handleRemoveStatus}
            onAddCategory={addCategory}
            onRemoveCategory={handleRemoveCategory}
          />
        </>
      ) : (
        <>
          <AddReminderModal
            open={showAdd}
            onClose={() => setShowAdd(false)}
            clients={clients}
            onSave={addReminder}
          />
          <AddReminderModal
            key={editItem?.id || 'edit-rem'}
            open={!!editItem}
            onClose={() => setEditItem(null)}
            reminder={editItem}
            clients={clients}
            onSave={(patch) => editItem && editReminder(editItem.id, patch)}
          />
          <ConfirmModal
            open={confirmClear}
            onClose={() => setConfirmClear(false)}
            title={t('clearConfirm.remindersTitle')}
            message={doneCount === 1 ? t('clearConfirm.remindersMessageOne') : t('clearConfirm.remindersMessageMany', { count: doneCount })}
            confirmLabel={t('clearConfirm.confirm')}
            danger
            onConfirm={() => clearCompletedReminders()}
          />
        </>
      )}
    </div>
  )
}
