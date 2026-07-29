import { useEffect, useMemo, useRef, useState } from 'react'
import { ListTodo, Plus, Trash2, Tags, ChevronDown, SlidersHorizontal, ClipboardList } from 'lucide-react'
import { usePopoverSide } from '../../hooks/usePopoverSide'
import { useTasks } from '../../hooks/useTasks'
import { useReminders } from '../../hooks/useReminders'
import { useProjects } from '../../hooks/useProjects'
import { useClients } from '../../hooks/useClients'
import { useTaskStatuses } from '../../hooks/useTaskStatuses'
import { useTaskCategories } from '../../hooks/useTaskCategories'
import { useT } from '../../i18n/useT'
import TaskItem from './TaskItem'
import ReminderItem from './ReminderItem'
import AddTaskModal from '../../modals/AddTaskModal'
import AddReminderModal from '../../modals/AddReminderModal'
import ConfirmModal from '../../modals/ConfirmModal'
import TaskTaxonomyModal from '../../modals/TaskTaxonomyModal'
import Coachmark from '../../components/Coachmark'
import { formatWhen, isRecurring, isActiveReminder, dueOccurrenceCount } from '@simplicity/core'
import { reassignTasksStatus } from '../../lib/api/taskStatuses'
import { reassignTasksCategory } from '../../lib/api/taskCategories'
import './TasksScreen.css'
import { Box, Txt, Btn } from '../../components/ui'

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
/* Reminders get their own tabs: open, completed, and the recurring schedule.
   "הושלמו" deliberately holds the SAME second slot it holds for tasks — it used
   to sit third here and second there, so flipping the entity toggle moved the
   tab under your finger and the muscle-memory tap landed on the wrong one. */
const REM_FILTERS = ['todo', 'done', 'recurring']

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

/* A task's deadline as a timestamp, or null when it has none / is unparsable.
   Shared by the group sort below. */
function dueTs(task) {
  if (!task.due_at) return null
  const v = +new Date(task.due_at)
  return Number.isNaN(v) ? null : v
}

/* Inside a group the deadline decides the order — soonest first, undated
   last. The fetch is newest-created first, which sat a task due next month
   above one due tomorrow; combined with the date not being rendered at all,
   the order read as arbitrary. Ties and the undated tail keep the fetch
   order, so a group where nothing is dated is unchanged. */
function byDueDate(a, b) {
  const da = dueTs(a)
  const db = dueTs(b)
  if (da === db) return 0
  if (da === null) return 1
  if (db === null) return -1
  return da - db
}

/* A dated, still-open task surfaces on the reminders view in its due bucket. */
function taskDueBucket(task, now) {
  if (!task.due_at || task.status === 'done') return null
  return dateToBucket(new Date(task.due_at), now)
}

export default function TasksScreen() {
  const { t } = useT('tasks')
  const { tasks, loading: tasksLoading, error: tasksError, addTask, toggleTask, editTask, removeTask, clearCompleted, refetch: refetchTasks } = useTasks()
  const { reminders, loading: remindersLoading, error: remindersError, addReminder, completeReminder, editReminder, removeReminder, clearCompleted: clearCompletedReminders } = useReminders()
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
  /* Grouping lives behind the "תצוגה" pill rather than a third row of tabs.
     Two identical-looking segmented controls stacked (filter, then grouping)
     gave no clue which did what; this is the shape the clients screen already
     uses for the same job. */
  const [viewOpen, setViewOpen] = useState(false)
  const viewAnchorRef = useRef(null)
  const viewSide = usePopoverSide(viewAnchorRef, viewOpen)
  const [collapsed, setCollapsed] = useState(() => new Set()) /* collapsed group keys */
  const toggleGroup = (key) => setCollapsed((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  /* Close the view popover when tapping outside — same dismissal as clients. */
  useEffect(() => {
    if (!viewOpen) return undefined
    const onDoc = (e) => {
      if (!viewAnchorRef.current?.contains(e.target)) setViewOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [viewOpen])

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

  /* The category pills are a SCOPE, not a view: everything the header and the
     hero report is counted inside them. They used to be counted over the whole
     table, so picking a category shrank the list while the summary above it
     went on describing the practice as a whole — two different answers to one
     question, on the same screen.
     The status TABS are deliberately not applied: the hero shows open and done
     side by side, so filtering by the active tab would zero out one of them. */
  const inCategoryScope = (row) => !categoryFilters.size || categoryFilters.has(row.category_id)
  const scopedTasks = useMemo(() => tasks.filter(inCategoryScope), [tasks, categoryFilters]) // eslint-disable-line react-hooks/exhaustive-deps -- inCategoryScope is derived from categoryFilters, already a dep
  const scopedReminders = useMemo(() => reminders.filter(inCategoryScope), [reminders, categoryFilters]) // eslint-disable-line react-hooks/exhaustive-deps -- same

  /* Counts for the header + hero ─ both entities share a pending/done
     contract so we can derive them with a single .status check. */
  const openCount  = isTasks
    ? scopedTasks.filter((t) => t.status !== 'done').length
    : scopedReminders.filter((r) => r.status !== 'completed').length
  const doneCount  = isTasks
    ? scopedTasks.filter((t) => t.status === 'done').length
    : scopedReminders.filter((r) => r.status === 'completed').length
  const now = useMemo(() => new Date(), [reminders, tasks, filter, view]) // eslint-disable-line react-hooks/exhaustive-deps -- deps intentionally refresh "now" when the list re-renders on data/filter/view change
  /* "Urgent" tile re-labels per entity: tasks use priority=high, while
     reminders use overdue (past due AND still pending). */
  const urgentCount = isTasks
    ? scopedTasks.filter((t) => t.status !== 'done' && t.priority === 'high').length
    : scopedReminders.filter((r) => r.status !== 'completed' && new Date(r.scheduled_at) < now).length

  /* Built on the same scoped set the counts use, so the list and the numbers
     above it can't drift apart; only the status tab is applied on top. */
  const filteredTasks = useMemo(() => {
    if (filter === 'todo') return scopedTasks.filter((t) => t.status !== 'done')
    if (filter === 'done') return scopedTasks.filter((t) => t.status === 'done')
    return scopedTasks
  }, [scopedTasks, filter])

  /* Build collapsible groups for the filtered tasks per the chosen groupBy.
     Priority keeps the original fixed order; project/category order follows
     the user's own project/category list, with an "unassigned" bucket last. */
  const taskGroups = useMemo(() => {
    /* .filter() already hands back a fresh array, so sorting it in place
       never touches the cached task list. */
    const inGroup = (pred) => filteredTasks.filter(pred).sort(byDueDate)
    if (groupBy === 'project') {
      const groups = projects.map((p) => ({
        key: `p-${p.id}`,
        label: p.name,
        color: p.color || GROUP_FALLBACK_COLOR,
        items: inGroup((task) => task.project_id === p.id),
      }))
      const none = inGroup((task) => !task.project_id || !projects.some((p) => p.id === task.project_id))
      if (none.length) groups.push({ key: 'p-none', label: t('groupBy.noProject'), color: GROUP_FALLBACK_COLOR, items: none })
      return groups.filter((g) => g.items.length)
    }
    if (groupBy === 'category') {
      const groups = taskCategories.map((c) => ({
        key: `c-${c.id}`,
        label: c.name,
        color: c.color || GROUP_FALLBACK_COLOR,
        items: inGroup((task) => task.category_id === c.id),
      }))
      const none = inGroup((task) => !task.category_id || !taskCategories.some((c) => c.id === task.category_id))
      if (none.length) groups.push({ key: 'c-none', label: t('groupBy.noCategory'), color: GROUP_FALLBACK_COLOR, items: none })
      return groups.filter((g) => g.items.length)
    }
    /* default: priority */
    return PRIORITY_GROUPS
      .map((g) => ({
        key: `pri-${g}`,
        label: t(`priority.${g}`),
        color: PRIORITY_COLOR[g],
        items: inGroup((task) => (task.priority || 'medium') === g),
      }))
      .filter((g) => g.items.length)
  }, [groupBy, filteredTasks, projects, taskCategories, t])

  /* Same scoped set as the reminder counts — the category pills drive both. */
  const filteredReminders = useMemo(() => {
    if (filter === 'done') return scopedReminders.filter((r) => r.status === 'completed')
    /* "פתוחות" = everything still owed, one-off and recurring alike, bucketed
       by its next occurrence (a recurring reminder's scheduled_at IS that
       occurrence). Recurring ones used to be gated on dueOccurrenceCount >= 1,
       which hid a weekly reminder set for next week completely — while an
       identical-looking one-off for the very same day appeared under
       "מאוחר יותר". Same-looking rows now behave the same; "חוזרות" stays the
       schedule view. */
    return scopedReminders.filter(isActiveReminder)
  }, [scopedReminders, filter])

  /* Dated tasks that "pop" onto the reminders view — open tasks with a due_at,
     shown only on the open ("פתוחות") tab, bucketed by their due date. They
     ride the same category scope as everything else on the screen. */
  const datedTasks = useMemo(() => (
    (view === 'reminders' && filter === 'todo')
      ? scopedTasks.filter((task) => task.due_at && task.status !== 'done')
      : []
  ), [view, filter, scopedTasks])

  /* "חוזרות" tab — all active recurring reminders, grouped: weekly by
     day-of-week, monthly together, every-X-days together. Scoped like every
     other tab: the pills stay on screen here, so ignoring them on this one tab
     read as the filter having silently stopped working. */
  const recurringGroups = useMemo(() => {
    if (isTasks) return []
    const rec = scopedReminders.filter((r) => isRecurring(r) && isActiveReminder(r))
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
  }, [scopedReminders, isTasks, t])

  const projOf = (id) => projects.find((p) => p.id === id)
  const clientNameOf = (id) => clients.find((c) => c.id === id)?.name

  /* Inline rename — a double-click / long-press on a card title saves just
     the title via the existing optimistic editTask/editReminder, no modal. */
  const renameTask = (id, title) => editTask(id, { title })
  const renameReminder = (id, title) => editReminder(id, { title })

  const emptyMsg = isTasks
    ? (filter === 'done' ? t('empty.tasksDone') : t('empty.tasksTodo'))
    : (filter === 'done' ? t('empty.remindersDone') : t('empty.remindersTodo'))

  return (
    <Box className="screen tk-screen">
      <Box className="screen-top">
        {/* Just the name of the screen, wearing its menu icon. The open/done
            counts that used to sit here were the same two numbers the summary
            card repeats a few pixels below, and the tagline went with them —
            the card now owns every number, and the header says where you are.
            The icon stays ClipboardList in both views: the toggle underneath
            says which of the two you are looking at, and a header that
            reshuffled its own icon would fight it. */}
        <Box as="header" className="screen-head">
          <Txt as="p" className="t-screen">
            <ClipboardList size={20} strokeWidth={1.6} aria-hidden="true" />
            {isTasks ? t('tasks') : t('reminders')}
          </Txt>
        </Box>
        <Coachmark id="add-task" radius="50%">
          <Btn
            className="cta-add"
            type="button"
            aria-label={isTasks ? t('add.taskAria') : t('add.reminderAria')}
            onClick={() => setShowAdd(true)}
          >
            {isTasks ? t('add.task') : t('add.reminder')}
          </Btn>
        </Coachmark>
      </Box>

      {/* Entity toggle — same role as Leads' kanban/statuses switcher,
          rendered below screen-top so it doesn't break the centered
          "+" slot. */}
      <Box className="mg-toggle t-view" role="tablist" aria-label={t('view.aria')}>
        <Btn
          type="button"
          className={`mg-toggle-btn${view === 'tasks' ? ' on' : ''}`}
          onClick={() => switchView('tasks')}
          role="tab"
          aria-selected={view === 'tasks'}
        >
          {t('tasks')}
        </Btn>
        <Btn
          type="button"
          className={`mg-toggle-btn${view === 'reminders' ? ' on' : ''}`}
          onClick={() => switchView('reminders')}
          role="tab"
          aria-selected={view === 'reminders'}
        >
          {t('reminders')}
        </Btn>
      </Box>

      <Box as="section" className="t-hero">
        <Box className="s-hero">
          <Txt as="p" className="t-hero-title">{isTasks ? t('hero.tasksTitle') : t('hero.remindersTitle')}</Txt>
          <Box className="t-hero-grid">
            <Box className="t-hero-stat">
              <Txt as="p" className="t-hero-stat-l">{t('hero.open')}</Txt>
              <Txt as="p" className="t-hero-stat-v mono">{openCount}</Txt>
            </Box>
            <Box className="t-hero-stat divided">
              <Txt as="p" className="t-hero-stat-l">{isTasks ? t('hero.urgentTasks') : t('hero.overdueReminders')}</Txt>
              <Txt as="p" className="t-hero-stat-v mono">{urgentCount}</Txt>
            </Box>
            <Box className="t-hero-stat">
              <Txt as="p" className="t-hero-stat-l">{t('hero.done')}</Txt>
              <Txt as="p" className="t-hero-stat-v mono">{doneCount}</Txt>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box className="mg-toggle t-filter" role="tablist" aria-label={t('filter.aria')}>
        {filters.map((f) => (
          <Btn
            key={f}
            id={`t-filter-${f}`}
            type="button"
            className={`mg-toggle-btn${filter === f ? ' on' : ''}`}
            onClick={() => setFilter(f)}
            role="tab"
            aria-selected={filter === f}
            /* These were tabs with no panel: a screen reader announced
               "tab, 1 of 3" and had nothing to move into. The list below is
               that panel now. */
            aria-controls="t-list"
          >
            {t(`filter.${f}`)}
          </Btn>
        ))}
      </Box>

      {/* Category filter + the view/taxonomy actions — shared across tasks AND
          reminders so the same categories/filter drive both views. Grouping
          joins the actions here instead of taking a row of its own. */}
      {(
        <Box className="t-tax-bar">
          {taskCategories.length > 0 ? (
            <Box className="t-cat-filter">
              <Btn type="button" className={`t-cat-pill${categoryFilters.size === 0 ? ' on' : ''}`} aria-pressed={categoryFilters.size === 0} onClick={() => setCategoryFilters(new Set())}>{t('taxonomy.all')}</Btn>
              {taskCategories.map((c) => (
                <Btn
                  key={c.id}
                  type="button"
                  className={`t-cat-pill${categoryFilters.has(c.id) ? ' on' : ''}`}
                  aria-pressed={categoryFilters.has(c.id)}
                  onClick={() => toggleCategoryFilter(c.id)}
                >
                  <Txt className="t-cat-dot" style={{ background: c.color || 'var(--stone)' }} />
                  {c.name}
                </Btn>
              ))}
            </Box>
          ) : <Txt />}
          <Box className="t-tax-actions">
            {/* Grouping is a tasks-only idea, exactly as the old tab row was. */}
            {isTasks && (
              <Box className="mg-menu-wrap" ref={viewAnchorRef}>
                <Btn
                  type="button"
                  className="mg-menu-btn"
                  onClick={() => setViewOpen((v) => !v)}
                  aria-expanded={viewOpen}
                  aria-haspopup="menu"
                >
                  <SlidersHorizontal size={14} strokeWidth={1.7} aria-hidden="true" />
                  {t('groupBy.label')}
                  {/* The chosen grouping echoed on the trigger, so a non-default
                      one isn't hidden inside the closed menu. */}
                  {groupBy !== 'priority' && <Txt className="mg-menu-active">· {t(`groupBy.${groupBy}`)}</Txt>}
                </Btn>
                {viewOpen && (
                  <Box className="mg-menu-pop" role="menu" style={{ [viewSide]: 0 }}>
                    <Txt as="p" className="mg-menu-h">{t('groupBy.heading')}</Txt>
                    {GROUP_BY.map((gb) => (
                      <Btn
                        key={gb}
                        type="button"
                        role="menuitemradio"
                        aria-checked={groupBy === gb}
                        className={`mg-menu-opt${groupBy === gb ? ' on' : ''}`}
                        onClick={() => { setGroupBy(gb); setViewOpen(false) }}
                      >
                        {t(`groupBy.${gb}`)}
                      </Btn>
                    ))}
                  </Box>
                )}
              </Box>
            )}
            <Btn type="button" className="t-manage-btn" onClick={() => setShowTaxonomy(true)}>
              <Tags size={14} strokeWidth={1.5} aria-hidden="true" />
              {t('taxonomy.manage')}
            </Btn>
          </Box>
        </Box>
      )}

      {filter === 'done' && doneCount > 0 && (
        <Box className="t-clear-row">
          <Btn type="button" className="t-clear-btn" onClick={() => setConfirmClear(true)}>
            <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
            {t('clearAll')}
          </Btn>
        </Box>
      )}

      <Box
        as="section"
        className="t-list"
        id="t-list"
        role="tabpanel"
        aria-labelledby={`t-filter-${filter}`}
      >
        {loading ? (
          <Box className="empty"><Txt as="p" className="empty-text">{isTasks ? t('loading.tasks') : t('loading.reminders')}</Txt></Box>
        ) : error ? (
          /* The raw Supabase message ("JWT expired", "FetchError: …") used to
             be printed straight at the user. It says nothing to a coach and
             frightens the ones this app is for — the sentence tells them what
             to do, and the technical text stays on the title for a support
             conversation. */
          <Box className="empty"><Txt as="p" className="empty-text" title={error}>{isTasks ? t('loadError.tasks') : t('loadError.reminders')}</Txt></Box>
        ) : isTasks ? (
          filteredTasks.length === 0 ? (
            tasks.length === 0 ? (
              <Box className="empty">
                <Txt className="empty-icon"><ListTodo size={28} strokeWidth={1.5} aria-hidden="true" /></Txt>
                <Txt as="p" className="empty-text">{t('empty.firstTask')}</Txt>
                <Btn className="empty-action" type="button" onClick={() => setShowAdd(true)}>
                  <Plus size={18} strokeWidth={1.5} aria-hidden="true" /> {t('empty.addTask')}
                </Btn>
              </Box>
            ) : (
              <Box className="empty"><Txt as="p" className="empty-text">{emptyMsg}</Txt></Box>
            )
          ) : (
            taskGroups.map((g) => {
              const isCollapsed = collapsed.has(g.key)
              return (
                <Box key={g.key} className={`t-group t-group-card${isCollapsed ? '' : ' open'}`}>
                  <Btn
                    type="button"
                    className="t-group-lbl t-group-toggle"
                    onClick={() => toggleGroup(g.key)}
                    aria-expanded={!isCollapsed}
                  >
                    <Txt className="t-group-dot" style={{ background: g.color }} />
                    {g.label}
                    <Txt className="t-group-count">{g.items.length}</Txt>
                    <ChevronDown size={14} strokeWidth={1.6} className={`t-group-chev${isCollapsed ? '' : ' open'}`} aria-hidden="true" />
                  </Btn>
                  {!isCollapsed && (
                    <Box className="t-group-body">
                      {g.items.map((task, i) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          project={projOf(task.project_id)}
                          clientName={clientNameOf(task.client_id)}
                          /* The date the group is now ordered by — it was only
                             ever rendered on the reminders view, so on its own
                             screen a task's deadline was invisible. */
                          dueLabel={task.due_at ? formatWhen(task.due_at) : null}
                          /* The dot mirrors the group it sits under, so the
                             group header IS its legend. It used to be priority
                             regardless of the grouping, which put two unlabelled
                             colour systems on one row — a project-coloured
                             heading over priority-coloured dots.
                             Priority then needs a carrier of its own when it
                             isn't what we're grouping by, so an urgent task says
                             so in words instead. */
                          dotColor={g.color}
                          urgentTag={groupBy !== 'priority' && (task.priority || 'medium') === 'high'}
                          onToggle={() => toggleTask(task)}
                          onEdit={setEditItem}
                          onRename={renameTask}
                          index={i}
                          taskStatus={task.status_id ? statusById.get(task.status_id) : null}
                          category={task.category_id ? categoryById.get(task.category_id) : null}
                        />
                      ))}
                    </Box>
                  )}
                </Box>
              )
            })
          )
        ) : (
          filter === 'recurring' ? (
            /* "חוזרות" — recurring schedule grouped by weekday / monthly. */
            recurringGroups.length === 0 ? (
              <Box className="empty"><Txt as="p" className="empty-text">{t('empty.noRecurring')}</Txt></Box>
            ) : (
              recurringGroups.map((g) => (
                <Box key={g.key} className="t-group">
                  <Txt as="p" className="t-group-lbl">
                    <Txt className="t-group-dot" style={{ background: g.color }} />
                    {g.label}
                    <Txt className="t-group-count">{g.items.length}</Txt>
                  </Txt>
                  {g.items.map((r, i) => (
                    <ReminderItem
                      key={r.id}
                      reminder={r}
                      clientName={clientNameOf(r.client_id)}
                      category={r.category_id ? categoryById.get(r.category_id) : null}
                      dotColor={g.color}
                      onComplete={completeReminder}
                      onEdit={setEditItem}
                      onRename={renameReminder}
                      index={i}
                    />
                  ))}
                </Box>
              ))
            )
          ) : (filteredReminders.length === 0 && datedTasks.length === 0) ? (
            <Box className="empty"><Txt as="p" className="empty-text">{filter === 'done' ? t('empty.remindersDone') : t('empty.remindersTodo')}</Txt></Box>
          ) : filter === 'done' ? (
            <Box className="t-group">
              <Txt as="p" className="t-group-lbl">
                <Txt className="t-group-dot" style={{ background: 'var(--stone)' }} />
                {t('doneGroup')}
                <Txt className="t-group-count">{filteredReminders.length}</Txt>
              </Txt>
              {filteredReminders.map((r, i) => (
                <ReminderItem
                  key={r.id}
                  reminder={r}
                  clientName={clientNameOf(r.client_id)}
                  category={r.category_id ? categoryById.get(r.category_id) : null}
                  dotColor="var(--stone)"
                  onComplete={completeReminder}
                  onEdit={setEditItem}
                  onRename={renameReminder}
                  index={i}
                />
              ))}
            </Box>
          ) : (
            REM_BUCKETS.map((b) => {
              const items = filteredReminders.filter((r) => reminderBucket(r, now) === b.key)
              const dueTasks = datedTasks.filter((task) => taskDueBucket(task, now) === b.key)
              if (!items.length && !dueTasks.length) return null
              return (
                <Box key={b.key} className="t-group">
                  <Txt as="p" className="t-group-lbl">
                    <Txt className="t-group-dot" style={{ background: b.color }} />
                    {t(`buckets.${b.key}`)}
                    <Txt className="t-group-count">{items.length + dueTasks.length}</Txt>
                  </Txt>
                  {items.map((r, i) => (
                    <ReminderItem
                      key={r.id}
                      reminder={r}
                      clientName={clientNameOf(r.client_id)}
                      category={r.category_id ? categoryById.get(r.category_id) : null}
                      dotColor={b.color}
                      onComplete={completeReminder}
                      onEdit={setEditItem}
                      onRename={renameReminder}
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
                      /* Already the bucket's colour here — the date is the
                         grouping, so priority always needs the word. */
                      dotColor={b.color}
                      urgentTag={(task.priority || 'medium') === 'high'}
                      onToggle={() => toggleTask(task)}
                      onEdit={setEditDatedTask}
                      onRename={renameTask}
                      index={items.length + i}
                      taskStatus={task.status_id ? statusById.get(task.status_id) : null}
                      category={task.category_id ? categoryById.get(task.category_id) : null}
                    />
                  ))}
                </Box>
              )
            })
          )
        )}
      </Box>

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
        onDelete={removeTask}
      />

      {/* Category/status taxonomy — shared, so the manage button works from
          both the tasks and reminders views. */}
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
            onDelete={removeTask}
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
        </>
      ) : (
        <>
          <AddReminderModal
            open={showAdd}
            onClose={() => setShowAdd(false)}
            clients={clients}
            categories={taskCategories}
            onSave={addReminder}
          />
          <AddReminderModal
            key={editItem?.id || 'edit-rem'}
            open={!!editItem}
            onClose={() => setEditItem(null)}
            reminder={editItem}
            clients={clients}
            categories={taskCategories}
            onSave={(patch) => editItem && editReminder(editItem.id, patch)}
            onDelete={removeReminder}
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
    </Box>
  )
}
