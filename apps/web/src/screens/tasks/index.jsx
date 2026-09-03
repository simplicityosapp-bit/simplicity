import { useEffect, useMemo, useRef, useState } from 'react'
import { ListTodo, Plus, Trash2, Tags, ChevronDown, SlidersHorizontal, ClipboardList, Search, X, CheckSquare } from 'lucide-react'
import { usePopoverSide } from '../../hooks/usePopoverSide'
import { useTasks } from '../../hooks/useTasks'
import { useReminders } from '../../hooks/useReminders'
import { useProjects } from '../../hooks/useProjects'
import { useClients } from '../../hooks/useClients'
import { useGroups } from '../../hooks/useGroups'
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
/* The ranking rules live in a module of their own so a test can pin them —
   they are the answer to "what do I owe first", they have been quietly wrong
   once already, and every one of them is the kind of rule a later tidy-up
   flattens back into a plain date sort. Same split the leads board uses for
   matchLead. */
import { PRESSURE_BUCKETS, CHRONO_PRESSURE, dateToBucket, pressureBucket, byPressure, byUrgency } from './pressure'
import { pushUndo } from '../../lib/undo'
import { reassignTasksStatus } from '../../lib/api/taskStatuses'
import { reassignTasksCategory } from '../../lib/api/taskCategories'
import './TasksScreen.css'
import { Box, Txt, Btn, Input } from '../../components/ui'

const PRIORITY_COLOR = {
  high: 'var(--clay)',
  medium: 'var(--amber-warn)',
  low: 'var(--sage)',
}
/* Group/filter keys; their labels are resolved via t() at render time
   (the constants live at module scope where t isn't available). */
const PRIORITY_GROUPS = ['high', 'medium', 'low']
/* Open / completed, and nothing else. There used to be a third "הכל" tab here;
   once "הכל" became the name of a MODE in the toggle above, the same word sat
   twice on one screen meaning two different things — a whole-practice view up
   top, a status slice down here. The mode keeps the word. */
const FILTERS = ['todo', 'done']
/* How the task list is grouped (collapsible sections). Priority is the
   default (preserves the original layout); project/category let the user
   re-slice the same tasks. */
const GROUP_BY = ['priority', 'project', 'category']
/* "הכל" gets its own, shorter set. Project and category are missing on purpose:
   a reminder has neither, so grouping by them would file every reminder under
   "ללא" and say nothing.

   PRESSURE leads, and is the default. The two that follow it are each half an
   answer, which is why neither could be the default:

   "תאריך" ranked purely by the calendar, so a task flagged דחוף with no
   deadline landed in the LAST group — under a reminder three weeks out — and
   a דחוף task due Thursday sat below a trivial one due Monday. Urgency was not
   an axis at all, only a tie-break inside a bucket the calendar had already
   chosen.

   "עדיפות" has the opposite hole: only a task carries a priority, so every
   reminder falls into one tail group and an OVERDUE reminder ends up below a
   task marked נמוך. The calendar stops meaning anything.

   Pressure is both axes at once, and it is the ranking the home widget has
   used since it merged the two cards (see tasksAndReminders in core domain/home).
   Until now the screen that widget links to ordered the very same rows
   differently — the same דחוף task sat third at home and last here. */
const ALL_GROUP_BY = ['pressure', 'date', 'priority']
const GROUP_FALLBACK_COLOR = 'var(--mist)'
/* Reminders get their own tabs: open, completed, and the recurring schedule.
   "הושלמו" deliberately holds the SAME second slot it holds for tasks — it used
   to sit third here and second there, so flipping the entity toggle moved the
   tab under your finger and the muscle-memory tap landed on the wrong one. */
const REM_FILTERS = ['todo', 'done', 'recurring']
/* Same two slices as tasks — there is no "recurring" for a mixed list. */
const ALL_FILTERS = FILTERS
/* The three things this screen can show. Tasks and reminders each answer half
   of "what do I owe"; "הכל" is the half-free answer, and the one the home
   widget has always given. */
const VIEWS = ['tasks', 'reminders', 'all']

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
/* "הכל" adds a tail bucket the date buckets have no room for: a task with no
   deadline is still owed. Dropping it is what kept the merged view from being
   a complete answer. */
const ALL_BUCKETS = [...REM_BUCKETS, { key: 'undated', color: 'var(--stone)' }]
function reminderBucket(rem, now) {
  if (rem.status === 'completed') return null
  return dateToBucket(new Date(rem.scheduled_at), now)
}

/* Tomorrow, keeping the item's own time of day. Deliberately measured from
   TODAY rather than from the item's own date: a reminder three weeks overdue
   pushed "one day on" from its own stale date would still be overdue, which is
   not what anyone means by "דחה למחר". */
function tomorrowAt(iso) {
  const src = new Date(iso)
  if (Number.isNaN(+src)) return null
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, src.getHours(), src.getMinutes(), 0, 0).toISOString()
}

/* Postponing only makes sense while the date is today or already behind you.
   On something scheduled for next month "tomorrow" would drag it FORWARD —
   the opposite of postponing — so the control isn't offered there. */
function canPostpone(iso) {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(+d)) return false
  const n = new Date()
  return d < new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1)
}

/* A task's deadline as a timestamp, or null when it has none / is unparsable.
   Shared by the group sort below. */
function dueTs(task) {
  if (!task.due_at) return null
  const v = +new Date(task.due_at)
  return Number.isNaN(v) ? null : v
}

/* When did this row FINISH? Tasks stamp completed_at; reminders have no such
   column but do carry a trigger-written updated_at, and completion is the last
   thing to touch a done reminder. Falls back to the row's own date so a row
   with neither still lands somewhere stable rather than at epoch. */
function doneTs(row) {
  const raw = row.completed_at || row.updated_at || row.due_at || row.scheduled_at
  const v = raw ? +new Date(raw) : NaN
  return Number.isNaN(v) ? 0 : v
}
/* Finished work reads newest-first. Every "הושלמו" list on this screen was
   ordered by DEADLINE — the same comparator the open lists use — which put the
   task you closed two months ago at the top and this morning's at the bottom,
   so the one thing you go to that tab to check (did that go through?) was the
   hardest row to find. */
const byRecency = (a, b) => doneTs(b) - doneTs(a)
/* Same rule over the mixed list, which wraps its rows one level deeper. */
const byItemRecency = (a, b) => doneTs(b.task || b.reminder) - doneTs(a.task || a.reminder)

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

/* The collapsible panel every list on this screen sits in. Only the task groups
   used to have it; the reminder buckets and the recurring schedule were bare
   glass labels over loose cards, so the same screen spoke two different visual
   languages depending on which side of the entity toggle you were on — and a
   long "מאוחר יותר" bucket could not be folded away the way a long "רגיל"
   group could. Extracted rather than copied four times. */
function GroupPanel({ groupKey, label, color, count, collapsed, onToggle, children }) {
  const isCollapsed = collapsed.has(groupKey)
  return (
    <Box className={`t-group t-group-card${isCollapsed ? '' : ' open'}`}>
      <Btn
        type="button"
        className="t-group-lbl t-group-toggle"
        onClick={() => onToggle(groupKey)}
        aria-expanded={!isCollapsed}
      >
        <Txt className="t-group-dot" style={{ background: color }} />
        {label}
        <Txt className="t-group-count">{count}</Txt>
        <ChevronDown size={14} strokeWidth={1.6} className={`t-group-chev${isCollapsed ? '' : ' open'}`} aria-hidden="true" />
      </Btn>
      {!isCollapsed && <Box className="t-group-body">{children}</Box>}
    </Box>
  )
}

export default function TasksScreen() {
  const { t } = useT('tasks')
  const { tasks, loading: tasksLoading, error: tasksError, addTask, toggleTask, editTask, removeTask, clearCompleted, refetch: refetchTasks } = useTasks()
  const { reminders, loading: remindersLoading, error: remindersError, addReminder, completeReminder, editReminder, removeReminder, clearCompleted: clearCompletedReminders } = useReminders()
  const { projects } = useProjects()
  const { clients } = useClients()
  /* Only for naming a group-linked reminder. Nothing in the app writes that
     link today — project detail reads and bulk-deletes by it — so this is
     here to keep the resolver honest rather than to serve live rows. */
  const { groups } = useGroups()
  const { statuses: taskStatuses, addStatus, removeStatus } = useTaskStatuses()
  const { categories: taskCategories, addCategory, removeCategory } = useTaskCategories()
  /* Top toggle drives entity choice. The rest of the screen reads
     from the active hook and renders the same chrome (header counts,
     hero stats, filter, list). */
  /* Opens on the mixed list. The screen's job on arrival is to answer "what do
     I owe" — the same question the home widget answers — and only "הכל" answers
     it without you first choosing which half to look at. משימות and תזכורות are
     where you go to organise one kind, which is a later, deliberate move. */
  const [view, setView] = useState('all')
  const [filter, setFilter] = useState('todo')
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [showTaxonomy, setShowTaxonomy] = useState(false)
  /* A task tapped from the mixed "הכל" list opens its own task editor,
     independent of the active view's edit state (different entity + modal).
     Its reminder twin does the same, so one list can edit both kinds. */
  const [editDatedTask, setEditDatedTask] = useState(null)
  const [editMixedReminder, setEditMixedReminder] = useState(null)
  /* Multi-select category filter — empty set = all categories. Several pills
     can be active at once (a task shows if its category is in the set). */
  const [categoryFilters, setCategoryFilters] = useState(() => new Set())
  const toggleCategoryFilter = (id) => setCategoryFilters((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  /* Free-text find across whatever the active view lists. Deliberately NOT
     folded into the category scope that feeds the hero: a scope you set once
     and forget deserves to be counted (see inCategoryScope), but a search you
     are actively typing would make every number on the screen jump per
     keystroke. The query sits in the box in front of you, so unlike a pill it
     explains its own effect. */
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  /* The field is a glyph until you want it. Closing CLEARS the query rather
     than hiding it: a filter still narrowing the list from behind a collapsed
     icon is the invisible-filter problem this screen has been chasing all
     along — the category pills earned their trigger echo for exactly that. */
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef(null)
  const closeSearch = () => { setSearchOpen(false); setQuery('') }
  useEffect(() => { if (searchOpen) searchRef.current?.focus() }, [searchOpen])

  /* Defined up here because the list builders below need them: a search that
     only read titles would miss "everything for דנה", and the client and
     project are already printed on the card the user is looking for. */
  const projOf = (id) => projects.find((p) => p.id === id)
  const clientNameOf = (id) => clients.find((c) => c.id === id)?.name
  /* A reminder does NOT have a client_id — the reminders table has no such
     column. It carries linked_to_type / linked_to_id, which is what every
     other reader of a reminder uses (the client file's own panel, the
     calendar, project detail). Reading r.client_id here handed clientNameOf
     an undefined every time, so a reminder created from a client's card —
     linked, correctly, in the database — printed with no sign of whose it
     was, on the one screen where all reminders sit together. Search had the
     same hole: "everything for רעות" could never match a reminder.
     Every kind of link resolves, not just the client one: a reminder set on a
     project or an investment was equally anonymous here. */
  const groupNameOf = (id) => groups.find((g) => g.id === id)?.name
  const remSubjectOf = (r) => {
    switch (r?.linked_to_type) {
      case 'client': return clientNameOf(r.linked_to_id)
      case 'project': return projOf(r.linked_to_id)?.name
      case 'group': return groupNameOf(r.linked_to_id)
      /* The investment link is a singleton: InvestmentRow stores it with a
         null id because there is only ever the one investment view, so there
         is nothing to look up and the label is the label. */
      case 'investment': return t('item.linkedInvestment')
      default: return undefined
    }
  }
  const hit = (...parts) => !q || parts.some((p) => (p || '').toLowerCase().includes(q))
  /* The details text is searchable for the same reason the reminder's is: it
     never appears on the card, so search is the only way back to what you
     wrote there. */
  const taskHit = (task) => hit(task.title, task.description, clientNameOf(task.client_id), projOf(task.project_id)?.name)
  const remHit = (r) => hit(r.title, r.description, remSubjectOf(r))

  /* Multi-select. Entered from the "תצוגה" menu, exactly where the clients
     screen keeps its own. Selection is keyed by row id across BOTH kinds — the
     mixed list can hand you a task and a reminder in one sweep — so each id
     carries its kind rather than the bar guessing later. */
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkCatOpen, setBulkCatOpen] = useState(false)
  const bulkCatRef = useRef(null)
  const bulkCatSide = usePopoverSide(bulkCatRef, bulkCatOpen)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const toggleSelect = (id) => setSelectedIds((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const [groupBy, setGroupBy] = useState('priority')
  /* Kept apart from `groupBy` rather than shared: the two modes don't offer the
     same choices, so one state would carry "project" into "הכל", which has no
     such grouping, and drag "date" back into the tasks view, which has no such
     grouping either. */
  const [allGroupBy, setAllGroupBy] = useState('pressure')
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

  /* Same dismissal for the bulk-category popover in the action bar. */
  useEffect(() => {
    if (!bulkCatOpen) return undefined
    const onDoc = (e) => {
      if (!bulkCatRef.current?.contains(e.target)) setBulkCatOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [bulkCatOpen])

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
  const isAll = view === 'all'
  /* Flip view + reset the filter tab and any in-progress edit. Done in the
     handler (not an effect) to avoid a cascading set-state-in-effect. */
  const switchView = (v) => { setView(v); setFilter('todo'); setEditItem(null) }
  const filters = isTasks ? FILTERS : (isAll ? ALL_FILTERS : REM_FILTERS)
  /* "הכל" draws on both tables, so it waits for both and reports either error. */
  const loading = isAll ? (tasksLoading || remindersLoading) : (isTasks ? tasksLoading : remindersLoading)
  const error = isAll ? (tasksError || remindersError) : (isTasks ? tasksError : remindersError)

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

  /* Counts for the hero ─ both entities share a pending/done contract so we
     can derive them with a single .status check, and "הכל" is simply both. */
  const openTasks = scopedTasks.filter((t) => t.status !== 'done').length
  const openRems = scopedReminders.filter((r) => r.status !== 'completed').length
  /* The ids, not merely the count. "מחיקת שהושלמו" used to call clearCompleted()
     with no argument, which swept the WHOLE table — while the button and its
     confirm dialog quoted these category-SCOPED numbers. With a category pill
     active the dialog asked "למחוק 3 פריטים?" and binned every completed row
     in the practice. The sweep now takes exactly the rows that were counted. */
  const doneTaskIds = useMemo(() => scopedTasks.filter((t) => t.status === 'done').map((t) => t.id), [scopedTasks])
  const doneRemIds = useMemo(() => scopedReminders.filter((r) => r.status === 'completed').map((r) => r.id), [scopedReminders])
  const doneTasks = doneTaskIds.length
  const doneRems = doneRemIds.length
  const openCount = isAll ? openTasks + openRems : (isTasks ? openTasks : openRems)
  const doneCount = isAll ? doneTasks + doneRems : (isTasks ? doneTasks : doneRems)
  /* "now" decides every bucket on this screen, so it has to keep moving. It was
     a useMemo over the data/filter/view deps — refreshed only when something
     ELSE changed — so a tab left open overnight went on calling yesterday
     "היום", and a deadline that passed while you were reading the list never
     turned red. A minute is the finest boundary that matters here (overdue),
     and the visibility/focus sync is what a laptop waking from sleep needs:
     timers do not fire while the machine is suspended. */
  const [nowTs, setNowTs] = useState(() => Date.now())
  useEffect(() => {
    const sync = () => setNowTs(Date.now())
    const id = setInterval(sync, 60000)
    const onVis = () => { if (!document.hidden) sync() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', sync)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', sync)
    }
  }, [])
  const now = useMemo(() => new Date(nowTs), [nowTs])
  /* Middle tile re-labels per view: tasks use priority=high ("דחופות"), while
     reminders use overdue ("באיחור"). "הכל" takes the overdue reading over both
     kinds — a passed deadline is the one fact a mixed list can state about
     everything in it, and it's the bucket that heads that list. */
  const overdueRems = scopedReminders.filter((r) => r.status !== 'completed' && new Date(r.scheduled_at) < now).length
  const urgentCount = isAll
    ? scopedTasks.filter((t) => t.status !== 'done' && t.due_at && new Date(t.due_at) < now).length + overdueRems
    : (isTasks
      ? scopedTasks.filter((t) => t.status !== 'done' && t.priority === 'high').length
      : overdueRems)

  /* Built on the same scoped set the counts use, so the list and the numbers
     above it can't drift apart; only the status tab is applied on top. */
  const filteredTasks = useMemo(() => (
    filter === 'done'
      ? scopedTasks.filter((t) => t.status === 'done' && taskHit(t))
      : scopedTasks.filter((t) => t.status !== 'done' && taskHit(t))
  ), [scopedTasks, filter, q, clients, projects]) // eslint-disable-line react-hooks/exhaustive-deps -- taskHit searches THROUGH clients/projects, so a rename (or a list that lands after the tasks do) has to re-run it

  /* Build collapsible groups for the filtered tasks per the chosen groupBy.
     Priority keeps the original fixed order; project/category order follows
     the user's own project/category list, with an "unassigned" bucket last. */
  const taskGroups = useMemo(() => {
    /* .filter() already hands back a fresh array, so sorting it in place
       never touches the cached task list.
       A deadline orders work you still owe; it says nothing useful about work
       already finished, so the done tab orders by when you finished instead. */
    const inGroup = (pred) => filteredTasks.filter(pred).sort(filter === 'done' ? byRecency : byDueDate)
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
  }, [groupBy, filter, filteredTasks, projects, taskCategories, t])

  /* Same scoped set as the reminder counts — the category pills drive both. */
  const filteredReminders = useMemo(() => {
    /* Newest-finished first, like every other done list here — the fetch is
       scheduled_at ASCENDING, so "הושלמו" opened on the oldest thing you ever
       ticked. .filter() hands back a fresh array, so the sort is safe. */
    if (filter === 'done') return scopedReminders.filter((r) => r.status === 'completed' && remHit(r)).sort(byRecency)
    /* "פתוחות" = everything still owed, one-off and recurring alike, bucketed
       by its next occurrence (a recurring reminder's scheduled_at IS that
       occurrence). Recurring ones used to be gated on dueOccurrenceCount >= 1,
       which hid a weekly reminder set for next week completely — while an
       identical-looking one-off for the very same day appeared under
       "מאוחר יותר". Same-looking rows now behave the same; "חוזרות" stays the
       schedule view. */
    return scopedReminders.filter((r) => isActiveReminder(r) && remHit(r))
  }, [scopedReminders, filter, q, clients, projects, groups]) // eslint-disable-line react-hooks/exhaustive-deps -- remHit resolves every link kind, so it reads all three lists

  /* "הכל" — both kinds in one list, which is the answer the home widget has
     always given and this screen never did: tasks alone can't tell you what is
     due today, reminders alone can't tell you what is merely owed.
     Dated tasks used to be sprinkled onto the REMINDERS view instead, which
     made a tab named after one kind quietly contain the other. That view is
     reminders again; the mixing happens here, where the name says so. */
  const allItems = useMemo(() => {
    if (!isAll) return []
    const wantDone = filter === 'done'
    const items = []
    scopedTasks.forEach((task) => {
      if ((task.status === 'done') !== wantDone || !taskHit(task)) return
      items.push({ key: `task-${task.id}`, kind: 'task', task, when: task.due_at || null })
    })
    scopedReminders.forEach((r) => {
      if (!remHit(r)) return
      const done = r.status === 'completed'
      if (done !== wantDone) return
      if (!wantDone && !isActiveReminder(r)) return
      items.push({ key: `rem-${r.id}`, kind: 'reminder', reminder: r, when: r.scheduled_at || null })
    })
    return items
  }, [isAll, filter, scopedTasks, scopedReminders, q, clients, projects, groups]) // eslint-disable-line react-hooks/exhaustive-deps -- the hit helpers derive from exactly these

  const allGroups = useMemo(() => {
    if (!isAll) return []
    if (filter === 'done') {
      return allItems.length
        ? [{ key: 'all-done', label: t('doneGroup'), color: 'var(--stone)', items: [...allItems].sort(byItemRecency) }]
        : []
    }
    /* The default — see ALL_GROUP_BY. Both axes at once: the clock decides the
       top of the list, the flag decides the middle, the calendar decides the
       rest. An empty band simply does not render, so a practice with nothing
       late never sees a "באיחור" heading. */
    if (allGroupBy === 'pressure') {
      return PRESSURE_BUCKETS
        .map((b) => ({
          key: `all-${b.key}`,
          /* "דחוף" borrows the priority label rather than minting a bucket
             string of its own — it IS that priority, and two keys for one word
             is how a group heading and the chip on the rows inside it drift
             apart in a later translation pass. */
          label: b.key === 'urgent' ? t('priority.high') : t(`buckets.${b.key}`),
          color: b.color,
          items: allItems
            .filter((it) => pressureBucket(it, now) === b.key)
            .sort(CHRONO_PRESSURE.has(b.key) ? byPressure : byUrgency),
        }))
        .filter((g) => g.items.length)
    }
    /* Grouped by urgency instead of by date. Only a task carries a priority, so
       the reminders land in one tail group rather than being scattered into
       urgency bands they never chose — a reminder is a nudge, not a ranking. */
    if (allGroupBy === 'priority') {
      const groups = PRIORITY_GROUPS.map((g) => ({
        key: `all-pri-${g}`,
        label: t(`priority.${g}`),
        color: PRIORITY_COLOR[g],
        items: allItems
          .filter((it) => it.kind === 'task' && (it.task.priority || 'medium') === g)
          .sort(byPressure),
      }))
      groups.push({
        key: 'all-pri-reminders',
        label: t('reminders'),
        color: GROUP_FALLBACK_COLOR,
        items: allItems.filter((it) => it.kind === 'reminder').sort(byPressure),
      })
      return groups.filter((g) => g.items.length)
    }
    return ALL_BUCKETS
      .map((b) => ({
        key: `all-${b.key}`,
        label: t(`buckets.${b.key}`),
        color: b.color,
        items: allItems
          .filter((it) => (b.key === 'undated'
            ? !it.when
            : !!it.when && dateToBucket(new Date(it.when), now) === b.key))
          .sort(byPressure),
      }))
      .filter((g) => g.items.length)
  }, [isAll, filter, allItems, now, t, allGroupBy])

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

  /* Inline rename — a double-click / long-press on a card title saves just
     the title via the existing optimistic editTask/editReminder, no modal. */
  const renameTask = (id, title) => editTask(id, { title })
  const renameReminder = (id, title) => editReminder(id, { title })

  /* Drop the selection whenever the visible set changes underneath it, or on
     leaving select mode. Adjusted during render rather than in an effect, to
     avoid a cascading set-state-in-effect — the pattern the clients screen
     settled on. Without it you could delete rows you can no longer see.
     The category pills and the search box narrow the visible set exactly the
     way the tabs do, so they belong in this key too — without them you could
     tick ten rows, filter down to one category (that menu stays open for
     multi-select, and the bulk bar stays on screen), then press "מחיקה", which
     resolves ids against the FULL list and takes nine rows you can no longer
     see with it. */
  const selScope = `${view}|${filter}|${selectMode}|${[...categoryFilters].sort().join(',')}|${q}`
  const [prevSelScope, setPrevSelScope] = useState(selScope)
  if (selScope !== prevSelScope) {
    setPrevSelScope(selScope)
    setSelectedIds(new Set())
  }

  /* The selected rows, resolved back to real records. Ids are prefixed by kind
     so one Set can hold both tables without collision. */
  const selectedTasks = useMemo(
    () => tasks.filter((x) => selectedIds.has(`task-${x.id}`)),
    [tasks, selectedIds],
  )
  const selectedReminders = useMemo(
    () => reminders.filter((r) => selectedIds.has(`rem-${r.id}`)),
    [reminders, selectedIds],
  )
  const selectedCount = selectedTasks.length + selectedReminders.length

  /* Mark every selected row done, undoably. Reminders go through
     completeReminder so a RECURRING one advances to its next occurrence
     instead of being stopped — the same asymmetry the single ✓ respects. */
  const bulkMarkDone = async () => {
    const openTasksSel = selectedTasks.filter((x) => x.status !== 'done')
    const snapshots = openTasksSel.map((x) => ({ id: x.id, status: x.status, completed_at: x.completed_at ?? null, status_id: x.status_id ?? null }))
    await Promise.all([
      ...openTasksSel.map((x) => editTask(x.id, { status: 'done', completed_at: new Date().toISOString(), status_id: null })),
      ...selectedReminders.filter((r) => r.status !== 'completed').map((r) => completeReminder(r)),
    ])
    const n = openTasksSel.length + selectedReminders.filter((r) => r.status !== 'completed').length
    if (!n) return
    setSelectMode(false)
    /* Only the tasks are reversible here: a recurring reminder that advanced
       has no single prior state worth restoring, and completeReminder already
       pushed its own undo for the one-offs. */
    if (snapshots.length) {
      pushUndo({
        label: t('bulk.doneUndo', { count: n }),
        undo: () => Promise.all(snapshots.map((s) => editTask(s.id, { status: s.status, completed_at: s.completed_at, status_id: s.status_id }))),
        redo: () => Promise.all(snapshots.map((s) => editTask(s.id, { status: 'done', completed_at: new Date().toISOString(), status_id: null }))),
      })
    }
  }

  const bulkSetCategory = async (categoryId) => {
    setBulkCatOpen(false)
    const snaps = [
      ...selectedTasks.map((x) => ({ kind: 'task', id: x.id, prev: x.category_id ?? null })),
      ...selectedReminders.map((r) => ({ kind: 'rem', id: r.id, prev: r.category_id ?? null })),
    ]
    if (!snaps.length) return
    const apply = (get) => Promise.all(snaps.map((s) => (s.kind === 'task'
      ? editTask(s.id, { category_id: get(s) })
      : editReminder(s.id, { category_id: get(s) }))))
    await apply(() => categoryId)
    setSelectMode(false)
    pushUndo({
      label: t('bulk.categoryUndo', { count: snaps.length }),
      undo: () => apply((s) => s.prev),
      redo: () => apply(() => categoryId),
    })
  }

  /* Soft-delete → Trash, restorable 30 days. That IS the safety net here, as
     with "מחיקת שהושלמו" — a per-row undo toast for a batch would be noise. */
  const bulkDelete = async () => {
    await Promise.all([
      ...selectedTasks.map((x) => removeTask(x.id)),
      ...selectedReminders.map((r) => removeReminder(r.id)),
    ])
    setSelectMode(false)
  }

  /* Postpone by one tap, undoable — a mis-tap on a row you meant to tick
     shouldn't cost you the date. Mirrors how toggleTask/completeReminder
     already register their own undo. */
  const postponeTask = (task) => {
    const next = tomorrowAt(task.due_at)
    if (!next) return
    const prev = task.due_at
    const apply = (due_at) => editTask(task.id, { due_at })
    apply(next)
    pushUndo({ label: t('item.snoozed'), undo: () => apply(prev), redo: () => apply(next) })
  }
  const postponeReminder = (r) => {
    const next = tomorrowAt(r.scheduled_at)
    if (!next) return
    const prev = r.scheduled_at
    const apply = (scheduled_at) => editReminder(r.id, { scheduled_at })
    apply(next)
    pushUndo({ label: t('item.snoozed'), undo: () => apply(prev), redo: () => apply(next) })
  }

  /* What the closed "תצוגה" pill admits to: a non-default grouping, an active
     category filter, or both. One category names itself; several just count. */
  const viewEcho = [
    isTasks && groupBy !== 'priority' ? t(`groupBy.${groupBy}`) : null,
    /* Same rule for the mixed list, against ITS default — a grouping hiding
       inside a closed menu is what this line exists to prevent. */
    isAll && allGroupBy !== 'pressure' ? t(`groupBy.${allGroupBy}`) : null,
    categoryFilters.size === 1
      ? (taskCategories.find((c) => categoryFilters.has(c.id))?.name || null)
      : (categoryFilters.size > 1 ? t('taxonomy.nSelected', { n: categoryFilters.size }) : null),
  ].filter(Boolean).join(' · ')

  const emptyMsg = isTasks
    ? (filter === 'done' ? t('empty.tasksDone') : t('empty.tasksTodo'))
    : (filter === 'done' ? t('empty.remindersDone') : t('empty.remindersTodo'))

  return (
    <Box className={`screen tk-screen${selectMode ? ' has-bulk-bar' : ''}`}>
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
            {isAll ? t('all') : (isTasks ? t('tasks') : t('reminders'))}
          </Txt>
        </Box>
        <Coachmark id="add-task" radius="50%" satisfied={tasks.length > 0 || reminders.length > 0}>
          {/* In the mixed view "+" adds a TASK — the screen's own entity, and
              the one you reach for far more often. A reminder is still one tap
              away through the תזכורות toggle. */}
          <Btn
            className="cta-add"
            type="button"
            aria-label={isTasks || isAll ? t('add.taskAria') : t('add.reminderAria')}
            onClick={() => setShowAdd(true)}
          >
            {isTasks || isAll ? t('add.task') : t('add.reminder')}
          </Btn>
        </Coachmark>
      </Box>

      <Box as="section" className="t-hero">
        <Box className="s-hero">
          {/* The entity toggle used to be a standalone centred pill on a band
              of its own between the header and this card. It belongs to the
              summary — it decides what the three numbers below it count — so it
              rides the card's top line, opposite the title, and the screen
              loses another full row of chrome. */}
          <Box className="t-hero-head">
            {/* No "סיכום כללי" heading. It titled three numbers that are each
                already labelled, inside a card whose whole content is visibly a
                summary — and being 11px it read at exactly the weight of the
                toggle beside it, so a heading and a control were
                indistinguishable. The toggle owns this line now. */}
            <Box className="mg-toggle t-view" role="tablist" aria-label={t('view.aria')}>
              {VIEWS.map((v) => (
                <Btn
                  key={v}
                  type="button"
                  className={`mg-toggle-btn${view === v ? ' on' : ''}`}
                  onClick={() => switchView(v)}
                  role="tab"
                  aria-selected={view === v}
                  aria-controls="t-list"
                >
                  {t(v)}
                </Btn>
              ))}
            </Box>
          </Box>
          <Box className="t-hero-grid">
            <Box className="t-hero-stat">
              <Txt as="p" className="t-hero-stat-l">{t('hero.open')}</Txt>
              <Txt as="p" className="t-hero-stat-v mono">{openCount}</Txt>
            </Box>
            <Box className="t-hero-stat divided">
              <Txt as="p" className="t-hero-stat-l">{isTasks ? t('hero.urgentTasks') : t('hero.overdueReminders')}</Txt>
              {/* "הכל" borrows the reminders label — see urgentCount above. */}
              <Txt as="p" className="t-hero-stat-v mono">{urgentCount}</Txt>
            </Box>
            <Box className="t-hero-stat">
              <Txt as="p" className="t-hero-stat-l">{t('hero.done')}</Txt>
              <Txt as="p" className="t-hero-stat-v mono">{doneCount}</Txt>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* One row for every control left above the list: the status tabs and the
          "תצוגה" menu, each anchored to an edge. Everything that used to occupy
          the taxonomy bar — the category pills, the statuses-and-categories
          link — lives inside that menu now, so the row it needed is gone. */}
      <Box className={`t-controls${searchOpen ? ' searching' : ''}`}>
        {/* Open, the field takes the whole row and the other two step aside:
            three controls fighting for a phone's width is what made the search
            a full band of its own before, and the moment you are typing a name
            you are not also reaching for a status tab. */}
        {searchOpen ? (
          <Box className="t-search">
            <Search size={16} strokeWidth={1.6} aria-hidden="true" />
            <Input
              ref={searchRef}
              type="search"
              placeholder={t('search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') closeSearch() }}
            />
            <Btn type="button" className="t-search-close" onClick={closeSearch} aria-label={t('searchClose')}>
              <X size={15} strokeWidth={1.8} aria-hidden="true" />
            </Btn>
          </Box>
        ) : (
        <>
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

        <Btn
          type="button"
          className="t-search-open"
          onClick={() => setSearchOpen(true)}
          aria-label={t('search')}
          aria-expanded={false}
        >
          <Search size={16} strokeWidth={1.7} aria-hidden="true" />
        </Btn>

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
            {/* Whatever is active, echoed on the trigger — a grouping that isn't
                the default, a category filter, or both. A filter hiding inside a
                closed menu is the failure this line exists to prevent, and it
                matters more now that the pills are in there too. */}
            {viewEcho && <Txt className="mg-menu-active">· {viewEcho}</Txt>}
          </Btn>
          {viewOpen && (
            <Box className="mg-menu-pop mg-menu-pop-wide" role="menu" style={{ [viewSide]: 0 }}>
              {/* Reminders are still grouped by date and that isn't a choice —
                  they have no priority, project or category to group on. The
                  mixed list does have one thing to ask beyond the date, though:
                  how urgent, so it offers date-or-urgency and nothing else. */}
              {(isTasks || isAll) && (
                <>
                  <Txt as="p" className="mg-menu-h">{t('groupBy.heading')}</Txt>
                  {(isAll ? ALL_GROUP_BY : GROUP_BY).map((gb) => {
                    const active = isAll ? allGroupBy === gb : groupBy === gb
                    return (
                      <Btn
                        key={gb}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        className={`mg-menu-opt${active ? ' on' : ''}`}
                        onClick={() => { (isAll ? setAllGroupBy : setGroupBy)(gb); setViewOpen(false) }}
                      >
                        {t(`groupBy.${gb}`)}
                      </Btn>
                    )
                  })}
                  <Box className="mg-menu-divider" />
                </>
              )}

              {/* Categories are a MULTI-select filter, so unlike the grouping
                  rows above they don't close the menu — you're usually picking
                  more than one, and a menu that shut after each tap would make
                  that four round trips. */}
              {taskCategories.length > 0 && (
                <>
                  <Txt as="p" className="mg-menu-h">{t('taxonomy.heading')}</Txt>
                  <Box className="t-cat-filter">
                    <Btn
                      type="button"
                      className={`t-cat-pill${categoryFilters.size === 0 ? ' on' : ''}`}
                      aria-pressed={categoryFilters.size === 0}
                      onClick={() => setCategoryFilters(new Set())}
                    >
                      {t('taxonomy.all')}
                    </Btn>
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
                  <Box className="mg-menu-divider" />
                </>
              )}

              {/* Acting on many rows at once, and editing the vocabulary
                  itself — both below the divider, because neither is choosing
                  from what the menu offers above. Same place the clients view
                  menu keeps its own multi-select. */}
              <Btn
                type="button"
                className={`mg-menu-opt mg-menu-opt-icon${selectMode ? ' on' : ''}`}
                onClick={() => { setSelectMode((v) => !v); setViewOpen(false) }}
              >
                <CheckSquare size={14} strokeWidth={1.6} aria-hidden="true" />
                {selectMode ? t('select.cancel') : t('select.enter')}
              </Btn>
              <Btn
                type="button"
                className="mg-menu-opt mg-menu-opt-icon"
                onClick={() => { setShowTaxonomy(true); setViewOpen(false) }}
              >
                <Tags size={14} strokeWidth={1.6} aria-hidden="true" />
                {t('taxonomy.manage')}
              </Btn>
            </Box>
          )}
        </Box>
        </>
        )}
      </Box>

      {/* Hidden while selecting: "מחיקת שהושלמו" sweeps a set the checkboxes
          have nothing to do with, and two delete affordances on one screen at
          the same time is how you delete the wrong thing. */}
      {!selectMode && filter === 'done' && doneCount > 0 && (
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
          <Box className="empty"><Txt as="p" className="empty-text">{isTasks || isAll ? t('loading.tasks') : t('loading.reminders')}</Txt></Box>
        ) : error ? (
          /* The raw Supabase message ("JWT expired", "FetchError: …") used to
             be printed straight at the user. It says nothing to a coach and
             frightens the ones this app is for — the sentence tells them what
             to do, and the technical text stays on the title for a support
             conversation. */
          <Box className="empty"><Txt as="p" className="empty-text" title={error}>{isTasks || isAll ? t('loadError.tasks') : t('loadError.reminders')}</Txt></Box>
        ) : isAll ? (
          allGroups.length === 0 ? (
            /* A fruitless search outranks every other empty message: "אין כלום
               פתוח" would be a lie about the practice when it is only true of
               the three letters you just typed. */
            q ? (
              <Box className="empty"><Txt as="p" className="empty-text">{t('empty.noSearchResults', { query: query.trim() })}</Txt></Box>
            ) : /* "הכל" is where the screen opens, so it inherits the first-run
               welcome the tasks view used to give: an account with nothing in
               it at all needs a way in, not the "all calm" line that belongs to
               someone who has cleared their plate. */
            (tasks.length === 0 && reminders.length === 0 && filter !== 'done') ? (
              <Box className="empty">
                <Txt className="empty-icon"><ListTodo size={28} strokeWidth={1.5} aria-hidden="true" /></Txt>
                <Txt as="p" className="empty-text">{t('empty.firstTask')}</Txt>
                <Btn className="empty-action" type="button" onClick={() => setShowAdd(true)}>
                  <Plus size={18} strokeWidth={1.5} aria-hidden="true" /> {t('empty.addTask')}
                </Btn>
              </Box>
            ) : (
              <Box className="empty"><Txt as="p" className="empty-text">{filter === 'done' ? t('empty.allDone') : t('empty.allTodo')}</Txt></Box>
            )
          ) : (
            allGroups.map((g) => (
              <GroupPanel
                key={g.key}
                groupKey={g.key}
                label={g.label}
                color={g.color}
                count={g.items.length}
                collapsed={collapsed}
                onToggle={toggleGroup}
              >
                {g.items.map((it, i) => (it.kind === 'task' ? (
                  <TaskItem
                    key={it.key}
                    task={it.task}
                    project={projOf(it.task.project_id)}
                    clientName={clientNameOf(it.task.client_id)}
                    dueLabel={it.task.due_at ? formatWhen(it.task.due_at) : null}
                    /* When the bucket is the date, priority needs the word —
                       same rule as the dated tasks used to follow. Grouped BY
                       urgency the heading already says it, so the tag would
                       just repeat the section it sits in. */
                    dotColor={g.color}
                    /* The chip carries the flag wherever the heading does not.
                       Inside "דחוף" the heading already says it — and grouped BY
                       priority every heading does — but a דחוף task sitting under
                       "באיחור" or "היום" still needs to admit what it is. */
                    urgentTag={allGroupBy !== 'priority' && g.key !== 'all-urgent' && (it.task.priority || 'medium') === 'high'}
                    onToggle={() => toggleTask(it.task)}
                    onEdit={setEditDatedTask}
                    onRename={renameTask}
                    selectMode={selectMode}
                    selected={selectedIds.has(`task-${it.task.id}`)}
                    onSelect={() => toggleSelect(`task-${it.task.id}`)}
                    onPostpone={canPostpone(it.task.due_at) ? postponeTask : undefined}
                    index={i}
                    taskStatus={it.task.status_id ? statusById.get(it.task.status_id) : null}
                    category={it.task.category_id ? categoryById.get(it.task.category_id) : null}
                  />
                ) : (
                  <ReminderItem
                    key={it.key}
                    reminder={it.reminder}
                    subjectName={remSubjectOf(it.reminder)}
                    category={it.reminder.category_id ? categoryById.get(it.reminder.category_id) : null}
                    dotColor={g.color}
                    onComplete={completeReminder}
                    onEdit={setEditMixedReminder}
                    onRename={renameReminder}
                    selectMode={selectMode}
                    selected={selectedIds.has(`rem-${it.reminder.id}`)}
                    onSelect={() => toggleSelect(`rem-${it.reminder.id}`)}
                    onPostpone={canPostpone(it.reminder.scheduled_at) ? postponeReminder : undefined}
                    count={dueOccurrenceCount(it.reminder, now)}
                    index={i}
                  />
                )))}
              </GroupPanel>
            ))
          )
        ) : isTasks ? (
          filteredTasks.length === 0 ? (
            q ? (
              <Box className="empty"><Txt as="p" className="empty-text">{t('empty.noSearchResults', { query: query.trim() })}</Txt></Box>
            ) : tasks.length === 0 ? (
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
            taskGroups.map((g) => (
                <GroupPanel
                  key={g.key}
                  groupKey={g.key}
                  label={g.label}
                  color={g.color}
                  count={g.items.length}
                  collapsed={collapsed}
                  onToggle={toggleGroup}
                >
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
                          selectMode={selectMode}
                          selected={selectedIds.has(`task-${task.id}`)}
                          onSelect={() => toggleSelect(`task-${task.id}`)}
                          onPostpone={canPostpone(task.due_at) ? postponeTask : undefined}
                          index={i}
                          taskStatus={task.status_id ? statusById.get(task.status_id) : null}
                          category={task.category_id ? categoryById.get(task.category_id) : null}
                        />
                      ))}
                </GroupPanel>
            ))
          )
        ) : (
          filter === 'recurring' ? (
            /* "חוזרות" — recurring schedule grouped by weekday / monthly. */
            recurringGroups.length === 0 ? (
              <Box className="empty"><Txt as="p" className="empty-text">{t('empty.noRecurring')}</Txt></Box>
            ) : (
              recurringGroups.map((g) => (
                <GroupPanel
                  key={g.key}
                  groupKey={g.key}
                  label={g.label}
                  color={g.color}
                  count={g.items.length}
                  collapsed={collapsed}
                  onToggle={toggleGroup}
                >
                  {g.items.map((r, i) => (
                    <ReminderItem
                      key={r.id}
                      reminder={r}
                      subjectName={remSubjectOf(r)}
                      category={r.category_id ? categoryById.get(r.category_id) : null}
                      dotColor={g.color}
                      onComplete={completeReminder}
                      onEdit={setEditItem}
                      onRename={renameReminder}
                      selectMode={selectMode}
                      selected={selectedIds.has(`rem-${r.id}`)}
                      onSelect={() => toggleSelect(`rem-${r.id}`)}
                      index={i}
                    />
                  ))}
                </GroupPanel>
              ))
            )
          ) : filteredReminders.length === 0 ? (
            <Box className="empty"><Txt as="p" className="empty-text">{q ? t('empty.noSearchResults', { query: query.trim() }) : (filter === 'done' ? t('empty.remindersDone') : t('empty.remindersTodo'))}</Txt></Box>
          ) : filter === 'done' ? (
            <GroupPanel
              groupKey="rem-done"
              label={t('doneGroup')}
              color="var(--stone)"
              count={filteredReminders.length}
              collapsed={collapsed}
              onToggle={toggleGroup}
            >
              {filteredReminders.map((r, i) => (
                <ReminderItem
                  key={r.id}
                  reminder={r}
                  subjectName={remSubjectOf(r)}
                  category={r.category_id ? categoryById.get(r.category_id) : null}
                  dotColor="var(--stone)"
                  onComplete={completeReminder}
                  onEdit={setEditItem}
                  onRename={renameReminder}
                  selectMode={selectMode}
                  selected={selectedIds.has(`rem-${r.id}`)}
                  onSelect={() => toggleSelect(`rem-${r.id}`)}
                  index={i}
                />
              ))}
            </GroupPanel>
          ) : (
            REM_BUCKETS.map((b) => {
              const items = filteredReminders.filter((r) => reminderBucket(r, now) === b.key)
              if (!items.length) return null
              return (
                <GroupPanel
                  key={b.key}
                  groupKey={b.key}
                  label={t(`buckets.${b.key}`)}
                  color={b.color}
                  count={items.length}
                  collapsed={collapsed}
                  onToggle={toggleGroup}
                >
                  {items.map((r, i) => (
                    <ReminderItem
                      key={r.id}
                      reminder={r}
                      subjectName={remSubjectOf(r)}
                      category={r.category_id ? categoryById.get(r.category_id) : null}
                      dotColor={b.color}
                      onComplete={completeReminder}
                      onEdit={setEditItem}
                      onRename={renameReminder}
                      selectMode={selectMode}
                      selected={selectedIds.has(`rem-${r.id}`)}
                      onSelect={() => toggleSelect(`rem-${r.id}`)}
                      onPostpone={canPostpone(r.scheduled_at) ? postponeReminder : undefined}
                      count={dueOccurrenceCount(r, now)}
                      index={i}
                    />
                  ))}
                </GroupPanel>
              )
            })
          )
        )}
      </Box>

      {/* Bulk action bar — floats over the list while selecting, the way the
          clients screen's does, so the actions stay reachable however far down
          you have scrolled to pick things. */}
      {selectMode && (
        <Box className="t-bulk-bar">
          <Txt className="t-bulk-count">{t('bulk.selected', { count: selectedCount })}</Txt>
          <Box className="t-bulk-actions">
            <Btn
              type="button"
              className="t-bulk-btn"
              onClick={bulkMarkDone}
              disabled={selectedCount === 0}
            >{t('bulk.markDone')}</Btn>

            {taskCategories.length > 0 && (
              <Box className="mg-menu-wrap" ref={bulkCatRef}>
                <Btn
                  type="button"
                  className="t-bulk-btn"
                  onClick={() => setBulkCatOpen((v) => !v)}
                  disabled={selectedCount === 0}
                  aria-expanded={bulkCatOpen}
                  aria-haspopup="menu"
                >{t('bulk.category')}</Btn>
                {bulkCatOpen && (
                  <Box className="mg-menu-pop t-bulk-pop" role="menu" style={{ [bulkCatSide]: 0 }}>
                    <Txt as="p" className="mg-menu-h">{t('taxonomy.heading')}</Txt>
                    {taskCategories.map((c) => (
                      <Btn key={c.id} type="button" className="mg-menu-opt" onClick={() => bulkSetCategory(c.id)}>
                        {c.name}
                      </Btn>
                    ))}
                    <Box className="mg-menu-divider" />
                    <Btn type="button" className="mg-menu-opt" onClick={() => bulkSetCategory(null)}>
                      {t('bulk.categoryNone')}
                    </Btn>
                  </Box>
                )}
              </Box>
            )}

            <Btn
              type="button"
              className="t-bulk-btn danger"
              onClick={() => setConfirmBulkDelete(true)}
              disabled={selectedCount === 0}
            >{t('bulk.delete')}</Btn>
            <Btn type="button" className="t-bulk-close" onClick={() => setSelectMode(false)} aria-label={t('bulk.closeAria')}>
              <X size={16} strokeWidth={1.7} aria-hidden="true" />
            </Btn>
          </Box>
        </Box>
      )}

      <ConfirmModal
        open={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        title={t('bulk.deleteTitle')}
        message={t('bulk.deleteMessage', { count: selectedCount })}
        confirmLabel={t('clearConfirm.confirm')}
        danger
        onConfirm={bulkDelete}
      />

      {/* The mixed "הכל" list can hand you either kind, so both editors are
          mounted regardless of the active view — the toggle decides what the
          LIST shows, not what you're allowed to open from it. */}
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
      <AddReminderModal
        key={editMixedReminder?.id || 'edit-mixed-rem'}
        open={!!editMixedReminder}
        onClose={() => setEditMixedReminder(null)}
        reminder={editMixedReminder}
        clients={clients}
        categories={taskCategories}
        onSave={(patch) => editMixedReminder && editReminder(editMixedReminder.id, patch)}
        onDelete={removeReminder}
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

      {/* WHAT "+" ADDS follows the button's own label, not the list underneath
          it. This used to hang off `isTasks`, so in the mixed view — where the
          CTA reads "+ משימה חדשה" — it opened the reminder form and quietly
          created a reminder instead. */}
      {isTasks || isAll ? (
        <AddTaskModal
          open={showAdd}
          onClose={() => setShowAdd(false)}
          projects={projects}
          clients={clients}
          statuses={taskStatuses}
          categories={taskCategories}
          onSave={addTask}
        />
      ) : (
        <AddReminderModal
          open={showAdd}
          onClose={() => setShowAdd(false)}
          clients={clients}
          categories={taskCategories}
          onSave={addReminder}
        />
      )}

      {/* Clearing completed work sweeps whatever the view is showing — in the
          mixed list that is BOTH tables. Hanging this off `isTasks` too meant
          "מחיקת שהושלמו" there swept only reminders and left every completed
          task sitting in a list that claimed to be empty. */}
      {isAll && (
        <ConfirmModal
          open={confirmClear}
          onClose={() => setConfirmClear(false)}
          title={t('clearConfirm.allTitle')}
          message={doneCount === 1 ? t('clearConfirm.allMessageOne') : t('clearConfirm.allMessageMany', { count: doneCount })}
          confirmLabel={t('clearConfirm.confirm')}
          danger
          onConfirm={async () => { await clearCompleted(doneTaskIds); await clearCompletedReminders(doneRemIds) }}
        />
      )}

      {/* Per-view editors and clear confirms. These are exclusive on purpose:
          the second arm used to be a plain `else`, which meant the mixed view
          ALSO mounted the reminders clear-confirm — two confirms open at once,
          the reminder one last in the DOM and therefore the one you actually
          saw and pressed. */}
      {isTasks && (
        <>
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
            onConfirm={() => clearCompleted(doneTaskIds)}
          />
        </>
      )}
      {!isTasks && !isAll && (
        <>
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
            onConfirm={() => clearCompletedReminders(doneRemIds)}
          />
        </>
      )}
    </Box>
  )
}
