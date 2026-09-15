import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { View, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, I18nManager, AppState } from 'react-native'
import { Text, TextInput } from '../components/Text'
import { Pressable } from '../components/Pressable'
import { useFocusEffect } from '@react-navigation/native'
import { Check, ChevronDown, Pencil, Tags, Trash2, Search, X, CalendarClock, ListTodo, Bell } from 'lucide-react-native'
import {
  fmtShortDate, formatWhen, startOfDay, isRecurring, isActiveReminder, dueOccurrenceCount,
  PRESSURE_KEYS, CHRONO_PRESSURE, dateToBucket, pressureBucket, byPressure, byUrgency,
  tomorrowAt, canPostpone, byDueDate, byRecency,
} from '@simplicity/core'
import i18n from '../lib/i18n'
import { pushUndo } from '../lib/undo'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import Sheet from '../components/Sheet'
import { Glass, GlassPressable } from '../components/Glass'
import AddTaskModal from '../modals/AddTaskModal'
import AddReminderModal from '../modals/AddReminderModal'
import TaskTaxonomyModal from '../modals/TaskTaxonomyModal'
import { colors } from '../theme/theme'
import { themed, themedMap, useThemeMode } from '../theme/themed'
import { useFormOptions } from '../lib/formOptions'
import { useTasksList } from '../hooks/useTasksList'
import { useRemindersList } from '../hooks/useRemindersList'
import { useTaskTaxonomy } from '../hooks/useTaskTaxonomy'
import { useBottomPad } from '../lib/bottomBar'

const PRIORITY_COLOR = themedMap((c) => ({ high: c.danger, medium: c.amberWarn, low: c.positive }))
const PRIORITY_GROUPS = ['high', 'medium', 'low']
/* Three modes, as on web. "הכל" leads: the screen's job on arrival is to answer
   "what do I owe", and only the mixed list answers it without first choosing
   which half to look at. */
const VIEWS = ['all', 'tasks', 'reminders']
// Open / done only — "הכל" is the name of a MODE now, so no status tab reuses it.
const TASK_FILTERS = ['todo', 'done']
const ALL_FILTERS = ['todo', 'done']
// "הושלמו" holds the same second slot for both kinds, so flipping the mode
// doesn't move the tab under your finger.
const REM_FILTERS = ['todo', 'done', 'recurring']
const GROUP_BY = ['priority', 'project', 'category']
/* The mixed list's groupings. Pressure leads — the ranking that puts an
   undated דחוף task above next week and an overdue reminder above a task
   marked נמוך (core domain/taskPressure). */
const ALL_GROUP_BY = ['pressure', 'date', 'priority']
// The dot colour for a project/category that has none of its own.
const fallbackColor = () => colors.textFaint
const BAND_COLOR = themedMap((c) => ({
  overdue: c.danger, today: c.amberWarn, urgent: c.danger, week: c.positive, later: c.textFaint, undated: c.textSub,
}))
const REM_BUCKETS = ['overdue', 'today', 'week', 'later']
const DATE_BUCKETS = [...REM_BUCKETS, 'undated']

// Tasks + Reminders screen (mirrors web screens/tasks): mode toggle, glass hero,
// filter, grouping, search and collapsible glass-card groups.
export default function TasksScreen() {
  const bottomPad = useBottomPad()
  const { tasks, loading: tLoading, error: tError, addTask, toggleDone, updateTask, deleteTask, clearCompleted: clearTasks, refetch: refetchTasks } = useTasksList()
  const { reminders, loading: rLoading, error: rError, addReminder, editReminder, completeReminder, deleteReminder, clearCompleted: clearRems, refetch: refetchRems } = useRemindersList()
  const { clients, projects, groups: allGroupsList = [], taskStatuses } = useFormOptions()
  const taxonomy = useTaskTaxonomy()
  const taskCategories = taxonomy.taskCategories
  // Persistent tab: silently re-pull tasks + reminders on RE-focus (skip mount).
  const firstFocus = useRef(true)
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return }
    refetchTasks(true); refetchRems(true)
  }, [refetchTasks, refetchRems]))
  const [view, setView] = useState('all')
  const [adding, setAdding] = useState(null) // null | 'choose' | 'task' | 'reminder'
  const [editTask, setEditTask] = useState(null)
  const [editRem, setEditRem] = useState(null)
  const [filter, setFilter] = useState('todo')
  const [groupBy, setGroupBy] = useState('priority')
  const [allGroupBy, setAllGroupBy] = useState('pressure')
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [categoryFilters, setCategoryFilters] = useState(() => new Set())
  const [showTaxonomy, setShowTaxonomy] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const toggleGroup = (k) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const toggleCategory = (id) => setCategoryFilters((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const isTasks = view === 'tasks'
  const isAll = view === 'all'
  const switchView = (v) => { setView(v); setFilter('todo') }
  // Group memos below put palette colours in their result — see their deps.
  const themeMode = useThemeMode()
  const clientById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.name])), [clients])
  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects])
  const groupById = useMemo(() => Object.fromEntries(allGroupsList.map((g) => [g.id, g.name])), [allGroupsList])
  const statusById = useMemo(() => Object.fromEntries((taskStatuses || []).map((s) => [s.id, s])), [taskStatuses])
  const categoryById = useMemo(() => Object.fromEntries(taskCategories.map((c) => [c.id, c])), [taskCategories])
  /* The screen's clock. It ticks once a minute and on every return to the
     foreground, so an item turns overdue and "today" rolls over while open. */
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 60 * 1000)
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setClock(Date.now()) })
    return () => { clearInterval(id); sub.remove() }
  }, [])
  const now = useMemo(() => new Date(clock), [clock])

  /* A reminder has no client_id — it carries linked_to_type / linked_to_id —
     and every kind of link resolves, so a reminder set on a project or a
     group is not anonymous here (web's remSubjectOf). */
  const remSubjectOf = (r) => {
    switch (r?.linked_to_type) {
      case 'client': return clientById[r.linked_to_id]
      case 'project': return projectById[r.linked_to_id]
      case 'group': return groupById[r.linked_to_id]
      case 'investment': return i18n.t('tasks:item.linkedInvestment')
      default: return null
    }
  }
  /* Free-text find across whatever the mode lists — title, details, and the
     client or project already printed on the row. The phone had no search on
     this screen at all. Deliberately not applied to the hero counts: a query
     you are typing would make every number jump per keystroke. */
  const q = query.trim().toLowerCase()
  const hit = (...parts) => !q || parts.some((p) => String(p || '').toLowerCase().includes(q))
  const taskHit = (t) => hit(t.title, t.description, clientById[t.client_id], projectById[t.project_id])
  const remHit = (r) => hit(r.title, r.description, remSubjectOf(r))

  /* The category pills are a SCOPE: everything the hero reports is counted
     inside them, so picking a category no longer shrinks the list while the
     numbers above it describe the whole practice. */
  const catMatch = (row) => !categoryFilters.size || categoryFilters.has(row.category_id)
  const scopedTasks = useMemo(() => tasks.filter(catMatch), [tasks, categoryFilters]) // eslint-disable-line react-hooks/exhaustive-deps
  const scopedRems = useMemo(() => reminders.filter(catMatch), [reminders, categoryFilters]) // eslint-disable-line react-hooks/exhaustive-deps

  const loading = isAll ? (tLoading || rLoading) : (isTasks ? tLoading : rLoading)
  const error = isAll ? (tError || rError) : (isTasks ? tError : rError)
  const openTasks = scopedTasks.filter((t) => t.status !== 'done').length
  const openRems = scopedRems.filter((r) => r.status !== 'completed').length
  const doneTaskRows = scopedTasks.filter((t) => t.status === 'done')
  const doneRemRows = scopedRems.filter((r) => r.status === 'completed')
  const openCount = isAll ? openTasks + openRems : (isTasks ? openTasks : openRems)
  const doneCount = isAll ? doneTaskRows.length + doneRemRows.length : (isTasks ? doneTaskRows.length : doneRemRows.length)
  const overdueRems = scopedRems.filter((r) => r.status !== 'completed' && new Date(r.scheduled_at) < now).length
  /* Middle tile: דחופות for tasks, באיחור for reminders, and for the mixed list
     the overdue reading over both — the one fact it can state about everything. */
  const urgentCount = isAll
    ? scopedTasks.filter((t) => t.status !== 'done' && t.due_at && new Date(t.due_at) < now).length + overdueRems
    : (isTasks ? scopedTasks.filter((t) => t.status !== 'done' && t.priority === 'high').length : overdueRems)
  /* What "clear completed" removes: exactly the done rows counted above. */
  const clearableTasks = isAll || isTasks ? doneTaskRows : []
  const clearableRems = isAll || !isTasks ? doneRemRows : []
  const clearableCount = clearableTasks.length + clearableRems.length

  /* Postpone by one tap, undoable — offered only while the date is today or
     behind you (canPostpone); "tomorrow" on next month's item would drag it
     forward. Measured from today, keeping the item's own time. */
  const postponeTask = (task) => {
    const next = tomorrowAt(task.due_at)
    if (!next) return
    const prev = task.due_at
    const apply = (due_at) => updateTask(task.id, { due_at }).catch(() => {})
    apply(next)
    pushUndo({ label: i18n.t('tasks:item.snoozed'), undo: () => apply(prev), redo: () => apply(next) })
  }
  const postponeReminder = (r) => {
    const next = tomorrowAt(r.scheduled_at)
    if (!next) return
    const prev = r.scheduled_at
    const apply = (scheduled_at) => editReminder(r.id, { scheduled_at }).catch(() => {})
    apply(next)
    pushUndo({ label: i18n.t('tasks:item.snoozed'), undo: () => apply(prev), redo: () => apply(next) })
  }

  // ── tasks mode ──
  const filteredTasks = useMemo(() => (
    scopedTasks.filter((t) => (filter === 'done' ? t.status === 'done' : t.status !== 'done') && taskHit(t))
  ), [scopedTasks, filter, q, clients, projects]) // eslint-disable-line react-hooks/exhaustive-deps
  const taskGroups = useMemo(() => {
    if (!isTasks) return []
    /* A deadline orders work still owed; finished work reads newest-first. */
    const inGroup = (pred) => filteredTasks.filter(pred).sort(filter === 'done' ? byRecency : byDueDate)
    if (groupBy === 'project') {
      const gs = projects.map((p) => ({ key: `p-${p.id}`, label: p.name, color: p.color || fallbackColor(), items: inGroup((t) => t.project_id === p.id) }))
      const none = inGroup((t) => !t.project_id || !projects.some((p) => p.id === t.project_id))
      if (none.length) gs.push({ key: 'p-none', label: i18n.t('tasks:groupBy.noProject', { defaultValue: 'ללא פרויקט' }), color: fallbackColor(), items: none })
      return gs.filter((g) => g.items.length)
    }
    if (groupBy === 'category') {
      const gs = taskCategories.map((c) => ({ key: `c-${c.id}`, label: c.name, color: c.color || fallbackColor(), items: inGroup((t) => t.category_id === c.id) }))
      const none = inGroup((t) => !t.category_id || !taskCategories.some((c) => c.id === t.category_id))
      if (none.length) gs.push({ key: 'c-none', label: i18n.t('tasks:groupBy.noCategory', { defaultValue: 'ללא קטגוריה' }), color: fallbackColor(), items: none })
      return gs.filter((g) => g.items.length)
    }
    return PRIORITY_GROUPS
      .map((g) => ({ key: `pri-${g}`, label: i18n.t(`tasks:priority.${g}`), color: PRIORITY_COLOR[g], items: inGroup((t) => (t.priority || 'medium') === g) }))
      .filter((g) => g.items.length)
    /* themeMode: the group dots are colours, and a memo would otherwise
       hand back the palette that was live when it last ran. */
  }, [isTasks, groupBy, filter, filteredTasks, projects, taskCategories, themeMode])

  // ── reminders mode ── (reminders only; dated tasks live in "הכל" now)
  const reminderGroups = useMemo(() => {
    if (view !== 'reminders') return []
    if (filter === 'recurring') {
      const rec = scopedRems.filter((r) => isRecurring(r) && isActiveReminder(r) && remHit(r))
      const gs = []
      for (let d = 0; d < 7; d++) {
        const items = rec.filter((r) => r.recurrence_type === 'weekly' && r.recurrence_pattern?.dayOfWeek === d)
        if (items.length) gs.push({ key: `w${d}`, label: i18n.t('tasks:recurring.weekday', { day: i18n.t(`tasks:days.${d}`) }), color: colors.positive, items })
      }
      const monthly = rec.filter((r) => r.recurrence_type === 'monthly_date')
      if (monthly.length) gs.push({ key: 'monthly', label: i18n.t('tasks:recurring.monthly'), color: colors.moonDeep, items: monthly })
      const everyX = rec.filter((r) => r.recurrence_type === 'every_x_days')
      if (everyX.length) gs.push({ key: 'everyx', label: i18n.t('tasks:recurring.everyXDays'), color: colors.danger, items: everyX })
      return gs
    }
    if (filter === 'done') {
      const items = scopedRems.filter((r) => r.status === 'completed' && remHit(r)).sort(byRecency)
      return items.length ? [{ key: 'done', label: i18n.t('tasks:doneGroup', { defaultValue: 'הושלמו' }), color: colors.textSub, items }] : []
    }
    /* Everything still owed, one-off and recurring alike, bucketed by its next
       occurrence — a weekly reminder set for next week is no longer hidden
       while an identical one-off for the same day shows. */
    const active = scopedRems.filter((r) => isActiveReminder(r) && remHit(r))
    return REM_BUCKETS
      .map((key) => ({ key, label: i18n.t(`tasks:buckets.${key}`), color: BAND_COLOR[key], items: active.filter((r) => dateToBucket(new Date(r.scheduled_at), now) === key) }))
      .filter((g) => g.items.length)
  }, [view, filter, scopedRems, now, q, themeMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── the mixed list ──
  const allItems = useMemo(() => {
    if (!isAll) return []
    const wantDone = filter === 'done'
    const items = []
    scopedTasks.forEach((task) => {
      if ((task.status === 'done') !== wantDone || !taskHit(task)) return
      items.push({ key: `task-${task.id}`, kind: 'task', task, when: task.due_at || null })
    })
    scopedRems.forEach((r) => {
      if ((r.status === 'completed') !== wantDone || !remHit(r)) return
      if (!wantDone && !isActiveReminder(r)) return
      items.push({ key: `rem-${r.id}`, kind: 'reminder', reminder: r, when: r.scheduled_at || null })
    })
    return items
  }, [isAll, filter, scopedTasks, scopedRems, q, clients, projects, allGroupsList]) // eslint-disable-line react-hooks/exhaustive-deps

  const mixedGroups = useMemo(() => {
    if (!isAll) return []
    if (filter === 'done') {
      const sorted = [...allItems].sort((a, b) => byRecency(a.task || a.reminder, b.task || b.reminder))
      return sorted.length ? [{ key: 'all-done', label: i18n.t('tasks:doneGroup'), color: colors.textSub, items: sorted }] : []
    }
    if (allGroupBy === 'pressure') {
      return PRESSURE_KEYS
        .map((key) => ({
          key: `all-${key}`,
          // "דחוף" borrows the priority label: it IS that priority.
          label: key === 'urgent' ? i18n.t('tasks:priority.high') : i18n.t(`tasks:buckets.${key}`),
          color: BAND_COLOR[key],
          items: allItems.filter((it) => pressureBucket(it, now) === key).sort(CHRONO_PRESSURE.has(key) ? byPressure : byUrgency),
        }))
        .filter((g) => g.items.length)
    }
    if (allGroupBy === 'priority') {
      const gs = PRIORITY_GROUPS.map((g) => ({
        key: `all-pri-${g}`,
        label: i18n.t(`tasks:priority.${g}`),
        color: PRIORITY_COLOR[g],
        items: allItems.filter((it) => it.kind === 'task' && (it.task.priority || 'medium') === g).sort(byPressure),
      }))
      gs.push({ key: 'all-pri-reminders', label: i18n.t('tasks:reminders'), color: fallbackColor(), items: allItems.filter((it) => it.kind === 'reminder').sort(byPressure) })
      return gs.filter((g) => g.items.length)
    }
    return DATE_BUCKETS
      .map((key) => ({
        key: `all-${key}`,
        label: i18n.t(`tasks:buckets.${key}`),
        color: BAND_COLOR[key],
        items: allItems.filter((it) => (key === 'undated' ? !it.when : !!it.when && dateToBucket(new Date(it.when), now) === key)).sort(byPressure),
      }))
      .filter((g) => g.items.length)
  }, [isAll, filter, allItems, now, allGroupBy, themeMode])

  const groups = isAll ? mixedGroups : (isTasks ? taskGroups : reminderGroups)
  const filters = isAll ? ALL_FILTERS : (isTasks ? TASK_FILTERS : REM_FILTERS)

  const renderTask = (t, first) => (
    <TaskRow key={`t-${t.id}`} task={t} first={first} clientById={clientById} projectById={projectById} status={statusById[t.status_id]} category={categoryById[t.category_id]}
      onToggle={() => toggleDone(t)} onEdit={() => setEditTask(t)}
      onPostpone={t.status !== 'done' && canPostpone(t.due_at, now) ? () => postponeTask(t) : null} />
  )
  const renderReminder = (r, first) => (
    <ReminderRow key={`r-${r.id}`} reminder={r} first={first} clientName={remSubjectOf(r)}
      count={filter === 'todo' && isRecurring(r) ? dueOccurrenceCount(r, now) : 1}
      onComplete={() => completeReminder(r)} onEdit={() => setEditRem(r)}
      onPostpone={r.status !== 'completed' && canPostpone(r.scheduled_at, now) ? () => postponeReminder(r) : null} />
  )

  const onAdd = () => setAdding(isAll ? 'choose' : isTasks ? 'task' : 'reminder')
  const heroTitle = isAll ? i18n.t('tasks:all') : isTasks ? i18n.t('tasks:hero.tasksTitle') : i18n.t('tasks:hero.remindersTitle')
  const middleLabel = isAll ? i18n.t('tasks:buckets.overdue') : isTasks ? i18n.t('tasks:hero.urgentTasks') : i18n.t('tasks:hero.overdueReminders')
  const hasAnyRows = isAll ? (tasks.length || reminders.length) : (isTasks ? tasks.length : reminders.length)

  return (
    <Screen name="tasks">
      {loading && !hasAnyRows ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, bottomPad]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { refetchTasks(); refetchRems() }} tintColor={colors.brand} />}
        >
          <ScreenHead
            title={isAll ? i18n.t('tasks:all') : isTasks ? i18n.t('tasks:tasks') : i18n.t('tasks:reminders')}
            onAdd={onAdd}
            addLabel={isTasks ? i18n.t('tasks:add.taskAria') : i18n.t('tasks:add.reminderAria')}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Segmented options={VIEWS.map((v) => ({ k: v, label: v === 'all' ? i18n.t('tasks:all') : i18n.t(`tasks:${v}`) }))} value={view} onPick={switchView} />

          <Card padded={false} contentStyle={styles.hero}>
            <Text style={styles.heroTitle}>{heroTitle}</Text>
            <View style={styles.heroGrid}>
              <HeroStat label={i18n.t('tasks:hero.open')} value={openCount} />
              <HeroStat label={middleLabel} value={urgentCount} divided />
              <HeroStat label={i18n.t('tasks:hero.done')} value={doneCount} />
            </View>
          </Card>

          <Glass radius={18} style={styles.searchBox}>
            <Search size={16} strokeWidth={1.6} color={colors.textFaint} />
            <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder={i18n.t('tasks:search')} placeholderTextColor={colors.textFaint} returnKeyType="search" />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel={i18n.t('tasks:searchClose')}>
                <X size={15} strokeWidth={1.8} color={colors.textSub} />
              </Pressable>
            ) : null}
          </Glass>

          <Segmented options={filters.map((f) => ({ k: f, label: i18n.t(`tasks:filter.${f}`) }))} value={filter} onPick={setFilter} />
          {isTasks ? (
            <Segmented options={GROUP_BY.map((g) => ({ k: g, label: i18n.t(`tasks:groupBy.${g}`) }))} value={groupBy} onPick={setGroupBy} />
          ) : null}
          {isAll && filter !== 'done' ? (
            <Segmented options={ALL_GROUP_BY.map((g) => ({ k: g, label: i18n.t(`tasks:groupBy.${g}`) }))} value={allGroupBy} onPick={setAllGroupBy} />
          ) : null}

          {/* Category filter + manage — shared across every mode */}
          <View style={styles.catBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catPills}>
              {taskCategories.length ? (
                <>
                  <GlassPressable radius={999} on={categoryFilters.size === 0} style={styles.catPill} onPress={() => setCategoryFilters(new Set())}>
                    <Text style={[styles.catText, categoryFilters.size === 0 && styles.catTextOn]}>{i18n.t('tasks:taxonomy.all', { defaultValue: 'הכל' })}</Text>
                  </GlassPressable>
                  {taskCategories.map((c) => {
                    const on = categoryFilters.has(c.id)
                    return (
                      <GlassPressable key={c.id} radius={999} on={on} style={styles.catPill} onPress={() => toggleCategory(c.id)}>
                        <View style={[styles.catDot, { backgroundColor: c.color || colors.textSub }]} />
                        <Text style={[styles.catText, on && styles.catTextOn]}>{c.name}</Text>
                      </GlassPressable>
                    )
                  })}
                </>
              ) : null}
            </ScrollView>
            <GlassPressable radius={999} style={styles.manageBtn} onPress={() => setShowTaxonomy(true)}>
              <Tags size={14} strokeWidth={1.6} color={colors.textSub} />
              <Text style={styles.catText}>{i18n.t('tasks:taxonomy.manage', { defaultValue: 'סטטוסים וקטגוריות' })}</Text>
            </GlassPressable>
          </View>

          {/* Clear all completed (only on the done filter) */}
          {filter === 'done' && clearableCount > 0 ? (
            <GlassPressable radius={999} style={styles.clearBtn} onPress={() => setConfirmClear(true)}>
              <Trash2 size={14} strokeWidth={1.6} color={colors.danger} />
              <Text style={styles.clearText}>{i18n.t('tasks:clearAll', { defaultValue: 'נקה הכל' })}</Text>
            </GlassPressable>
          ) : null}

          {groups.length ? (
            groups.map((g) => {
              const isOpen = !collapsed.has(g.key)
              return (
                <Card key={g.key} padded={false} style={styles.groupOuter} contentStyle={styles.group}>
                  <Pressable style={styles.groupHead} onPress={() => toggleGroup(g.key)}>
                    <View style={[styles.groupDot, { backgroundColor: g.color }]} />
                    <Text style={styles.groupLabel}>{g.label}</Text>
                    <Text style={styles.groupCount}>{g.items.length}</Text>
                    <ChevronDown size={16} strokeWidth={1.6} color={colors.textSub} style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }} />
                  </Pressable>
                  {isOpen ? (
                    <View style={styles.groupBody}>
                      {g.items.map((it, i) => {
                        if (isAll) return it.kind === 'task' ? renderTask(it.task, i === 0) : renderReminder(it.reminder, i === 0)
                        return isTasks ? renderTask(it, i === 0) : renderReminder(it, i === 0)
                      })}
                    </View>
                  ) : null}
                </Card>
              )
            })
          ) : (
            <Text style={styles.empty}>{emptyMsg(view, filter, !!q)}</Text>
          )}
        </ScrollView>
      )}

      {/* "הכל" holds both kinds, so adding asks which. */}
      <Sheet open={adding === 'choose'} onClose={() => setAdding(null)} title={i18n.t('tasks:all')}>
        <View style={styles.chooser}>
          <Pressable style={styles.chooseBtn} onPress={() => setAdding('task')} accessibilityRole="button">
            <ListTodo size={20} strokeWidth={1.6} color={colors.brand} />
            <Text style={styles.chooseText}>{i18n.t('tasks:add.taskAria')}</Text>
          </Pressable>
          <Pressable style={styles.chooseBtn} onPress={() => setAdding('reminder')} accessibilityRole="button">
            <Bell size={20} strokeWidth={1.6} color={colors.brand} />
            <Text style={styles.chooseText}>{i18n.t('tasks:add.reminderAria')}</Text>
          </Pressable>
        </View>
      </Sheet>
      <AddTaskModal open={adding === 'task'} onClose={() => setAdding(null)} onSave={addTask} />
      <AddReminderModal open={adding === 'reminder'} onClose={() => setAdding(null)} onSave={addReminder} />
      <AddTaskModal open={!!editTask} task={editTask} onClose={() => setEditTask(null)} onSave={(patch) => updateTask(editTask.id, patch)} onDelete={() => { deleteTask(editTask.id); setEditTask(null) }} />
      <AddReminderModal open={!!editRem} reminder={editRem} onClose={() => setEditRem(null)} onSave={(patch) => editReminder(editRem.id, patch)} onDelete={() => { deleteReminder(editRem.id); setEditRem(null) }} />
      <TaskTaxonomyModal
        open={showTaxonomy}
        onClose={() => setShowTaxonomy(false)}
        statuses={taskStatuses || []}
        categories={taskCategories}
        onAddStatus={taxonomy.addStatus}
        onRemoveStatus={taxonomy.removeStatus}
        onAddCategory={taxonomy.addCategory}
        onRemoveCategory={taxonomy.removeCategory}
      />

      {/* Confirm clear-all completed */}
      <Sheet open={confirmClear} onClose={() => setConfirmClear(false)} title={i18n.t(!isTasks && !isAll ? 'tasks:clearConfirm.remindersTitle' : 'tasks:clearConfirm.tasksTitle', { defaultValue: i18n.t('tasks:clearAll', { defaultValue: 'נקה הכל' }) })}>
        <Text style={styles.confirmMsg}>
          {i18n.t(
            clearableCount === 1
              ? (!isTasks && !isAll ? 'tasks:clearConfirm.remindersMessageOne' : 'tasks:clearConfirm.tasksMessageOne')
              : (!isTasks && !isAll ? 'tasks:clearConfirm.remindersMessageMany' : 'tasks:clearConfirm.tasksMessageMany'),
            { count: clearableCount, defaultValue: '' },
          )}
        </Text>
        <View style={styles.confirmActions}>
          <Pressable style={styles.confirmCancel} onPress={() => setConfirmClear(false)}><Text style={styles.confirmCancelText}>{i18n.t('modalsTask:common.cancel', { defaultValue: 'ביטול' })}</Text></Pressable>
          <Pressable
            style={styles.confirmDelete}
            onPress={() => {
              if (clearableTasks.length) clearTasks(clearableTasks.map((x) => x.id))
              if (clearableRems.length) clearRems(clearableRems.map((x) => x.id))
              setConfirmClear(false)
            }}
          >
            <Text style={styles.confirmDeleteText}>{i18n.t('tasks:clearConfirm.confirm', { defaultValue: i18n.t('tasks:clearAll', { defaultValue: 'נקה הכל' }) })}</Text>
          </Pressable>
        </View>
      </Sheet>
    </Screen>
  )
}

function emptyMsg(view, filter, searching) {
  if (searching) return i18n.t('tasks:empty.tasksTodo', { defaultValue: '—' })
  if (view === 'reminders') {
    if (filter === 'recurring') return i18n.t('tasks:empty.noRecurring', { defaultValue: '—' })
    return i18n.t(filter === 'done' ? 'tasks:empty.remindersDone' : 'tasks:empty.remindersTodo', { defaultValue: '—' })
  }
  return i18n.t(filter === 'done' ? 'tasks:empty.tasksDone' : 'tasks:empty.tasksTodo', { defaultValue: '—' })
}

/* No accent on any of the three. Web gives all three hero stats the same
   --espresso, and in night mode the old brand-coloured "urgent" was the
   faintest of the three. */
function HeroStat({ label, value, divided }) {
  return (
    <View style={[styles.heroStat, divided && styles.heroStatDivided]}>
      <Text style={styles.heroStatL}>{label}</Text>
      <Text style={styles.heroStatV}>{value}</Text>
    </View>
  )
}

function Segmented({ options, value, onPick }) {
  return (
    <Glass radius={999} style={styles.seg}>
      {options.map((o) => {
        const on = value === o.k
        return (
          <Pressable key={o.k} style={[styles.segBtn, on && styles.segOn]} onPress={() => onPick(o.k)} hitSlop={8}>
            <Text style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
          </Pressable>
        )
      })}
    </Glass>
  )
}

function PostponeButton({ onPress }) {
  return (
    <Pressable accessibilityLabel={i18n.t('tasks:item.snooze')} onPress={onPress} hitSlop={8} style={styles.postpone}>
      <CalendarClock size={14} strokeWidth={1.6} color={colors.textSub} />
    </Pressable>
  )
}

function TaskRow({ task, first, clientById, projectById, status, category, onToggle, onEdit, onPostpone }) {
  const isDone = task.status === 'done'
  const overdue = !isDone && task.due_at && new Date(task.due_at) < startOfDay(new Date())
  const meta = [task.due_at ? fmtShortDate(task.due_at) : null, clientById[task.client_id], projectById[task.project_id]].filter(Boolean).join(' · ')
  // Hebrew but a non-RTL engine (RN Web / pre-restart) → flip the row so the
  // check sits on the RIGHT with the right-aligned text + chips (matches device).
  const rtl = (i18n.language || '').startsWith('he')
  const flip = rtl && !I18nManager.isRTL
  const align = rtl ? 'right' : 'left'
  return (
    <View style={[styles.row, !first && styles.rowBorder, flip && styles.rowFlip]}>
      {/* The most-tapped control on the screen, and a 22pt circle: 11 of slop
          makes it 44 without changing how it looks. */}
      <Pressable accessibilityLabel={task.title || ''} onPress={onToggle} hitSlop={11} accessibilityRole="checkbox" accessibilityState={{ checked: isDone }}>
        <View style={[styles.check, isDone && styles.checkOn]}>{isDone ? <Check size={13} strokeWidth={3} color={colors.onBrand} /> : null}</View>
      </Pressable>
      <Pressable style={styles.textWrap} onPress={onEdit}>
        <View style={[styles.titleRow, flip && styles.rowFlip]}>
          <Text style={[styles.text, isDone && styles.textDone, { textAlign: align }]} numberOfLines={2}>{task.title || ''}</Text>
          {status ? <Text style={styles.chip} numberOfLines={1}>{status.icon ? `${status.icon} ` : ''}{status.display_name}</Text> : null}
        </View>
        <View style={[styles.metaRow, flip && styles.rowFlip]}>
          {category ? (
            <View style={styles.catTag}><View style={[styles.catTagDot, { backgroundColor: category.color || colors.textSub }]} /><Text style={styles.catTagText}>{category.name}</Text></View>
          ) : null}
          {meta ? <Text style={[styles.meta, overdue && styles.metaOverdue, { textAlign: align }]} numberOfLines={1}>{meta}</Text> : null}
        </View>
      </Pressable>
      {onPostpone ? <PostponeButton onPress={onPostpone} /> : null}
    </View>
  )
}

function ReminderRow({ reminder, first, clientName, count, onComplete, onEdit, onPostpone }) {
  const isDone = reminder.status === 'completed'
  const meta = [clientName, formatWhen(reminder.scheduled_at)].filter(Boolean).join(' · ')
  const rtl = (i18n.language || '').startsWith('he')
  const flip = rtl && !I18nManager.isRTL
  const align = rtl ? 'right' : 'left'
  return (
    <View style={[styles.row, !first && styles.rowBorder, flip && styles.rowFlip]}>
      <Pressable accessibilityLabel={reminder.title || ''} onPress={() => !isDone && onComplete()} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: isDone }}>
        <View style={[styles.check, styles.checkRem, isDone && styles.checkOn]}>{isDone ? <Check size={13} strokeWidth={3} color={colors.onBrand} /> : null}</View>
      </Pressable>
      <Pressable style={styles.textWrap} onPress={onEdit}>
        <View style={[styles.titleRow, flip && styles.rowFlip]}>
          <Text style={[styles.text, isDone && styles.textDone, { textAlign: align }]} numberOfLines={2}>{reminder.title || ''}</Text>
          {count > 1 ? <Text style={styles.chip}>×{count}</Text> : null}
        </View>
        {meta ? <Text style={[styles.meta, { textAlign: align }]} numberOfLines={1}>{meta}</Text> : null}
      </Pressable>
      {onPostpone ? <PostponeButton onPress={onPostpone} /> : null}
      <Pressable accessibilityLabel={i18n.t('modalsTask:reminder.titleEdit')} onPress={onEdit} hitSlop={8}><Pencil size={13} strokeWidth={1.6} color={colors.textFaint} /></Pressable>
    </View>
  )
}

const styles = themed((c, t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, gap: 12 },
  error: { color: c.danger, fontSize: 13 },
  empty: { color: c.textFaint, fontSize: 14, textAlign: 'center', marginTop: 24 },

  hero: { paddingVertical: 16, paddingHorizontal: 12, gap: 12 },
  heroTitle: { fontSize: 11, fontWeight: '500', color: c.textSub, letterSpacing: 0.4, textAlign: 'center' },
  heroGrid: { flexDirection: 'row' },
  heroStat: { flex: 1, alignItems: 'center', gap: 4 },
  heroStatDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: c.divider },
  heroStatL: { fontSize: 9, fontWeight: '500', color: c.textSub, letterSpacing: 0.4, textTransform: 'uppercase' },
  heroStatV: { fontSize: 22, fontWeight: '500', color: c.text },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: c.text },

  seg: { flexDirection: 'row', padding: 2, alignSelf: 'center' },
  segBtn: { minHeight: 44, justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 16, borderRadius: 999 },
  segOn: { backgroundColor: c.brand },
  segText: { fontSize: 12, color: c.textSub },
  segTextOn: { color: c.onBrand, fontWeight: '600' },

  // Category filter bar
  /* Wraps, and the pill strip claims the whole first line — see git history
     for why the manage link no longer shares the row with the filter. */
  catBar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  catScroll: { flexBasis: '100%' },
  catPills: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  catPill: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 12 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catText: { fontSize: 12, color: c.textSub },
  catTextOn: { color: c.onBrand, fontWeight: '600' },
  manageBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 12 },
  clearBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, alignSelf: 'center', borderColor: 'rgba(181,99,78,0.35)' },
  clearText: { fontSize: 12, fontWeight: '500', color: c.danger },
  confirmMsg: { fontSize: 14, color: c.text, lineHeight: 20 },
  confirmActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  confirmCancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
  confirmCancelText: { fontSize: 15, color: c.textSub },
  confirmDelete: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: c.dangerFill, alignItems: 'center' },
  confirmDeleteText: { fontSize: 15, fontWeight: '600', color: c.onBrand },
  chooser: { flexDirection: 'row', gap: 10 },
  chooseBtn: { flex: 1, minHeight: 88, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
  chooseText: { fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'center' },

  groupOuter: { marginTop: 0 },
  group: {},
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 14 },
  groupDot: { width: 10, height: 10, borderRadius: 5 },
  groupLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: c.text },
  groupCount: { fontSize: 11, fontWeight: '500', color: c.textSub, backgroundColor: c.fillStrong, borderRadius: 10, paddingVertical: 1, paddingHorizontal: 8, overflow: 'hidden' },
  groupBody: { paddingHorizontal: 14, paddingBottom: 6 },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 11 },
  rowFlip: { flexDirection: 'row-reverse' },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.divider, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  // A reminder's check is square-cornered so the two kinds read apart in "הכל".
  checkRem: { borderRadius: 6 },
  checkOn: { backgroundColor: c.positive, borderColor: c.positive },
  textWrap: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { flex: 1, fontSize: 14, color: c.text, lineHeight: 20 },
  textDone: { color: c.textFaint, textDecorationLine: 'line-through' },
  chip: { fontSize: 10, color: c.textSub, backgroundColor: c.fill, borderRadius: 8, paddingVertical: 1, paddingHorizontal: 7, overflow: 'hidden' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  catTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 1, paddingHorizontal: 7, borderRadius: 8, backgroundColor: c.fill },
  catTagDot: { width: 6, height: 6, borderRadius: 3 },
  catTagText: { fontSize: 10, color: c.textSub },
  meta: { fontSize: 12, color: c.textFaint },
  metaOverdue: { color: c.amberWarn },
  postpone: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: c.fill },
}))

HeroStat.displayName = 'HeroStat'
Segmented.displayName = 'Segmented'
PostponeButton.displayName = 'PostponeButton'
TaskRow.displayName = 'TaskRow'
ReminderRow.displayName = 'ReminderRow'
