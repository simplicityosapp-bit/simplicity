import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, I18nManager } from 'react-native'
import { Check, ChevronDown, Pencil, Tags, Trash2 } from 'lucide-react-native'
import { fmtShortDate, formatWhen, startOfDay, isRecurring, isActiveReminder, dueOccurrenceCount } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import Sheet from '../components/Sheet'
import { Glass, GlassPressable } from '../components/Glass'
import AddTaskModal from '../modals/AddTaskModal'
import AddReminderModal from '../modals/AddReminderModal'
import TaskTaxonomyModal from '../modals/TaskTaxonomyModal'
import { colors } from '../theme/theme'
import { useFormOptions } from '../lib/formOptions'
import { useTasksList } from '../hooks/useTasksList'
import { useRemindersList } from '../hooks/useRemindersList'
import { useTaskTaxonomy } from '../hooks/useTaskTaxonomy'

const PRIORITY_COLOR = { high: colors.danger, medium: colors.amberWarn, low: colors.positive }
const PRIORITY_GROUPS = ['high', 'medium', 'low']
const TASK_FILTERS = ['todo', 'done', 'all']
const REM_FILTERS = ['todo', 'recurring', 'done']
const GROUP_BY = ['priority', 'project', 'category']
const FALLBACK = colors.textFaint
const REM_BUCKETS = [
  { key: 'overdue', color: colors.danger },
  { key: 'today', color: colors.amberWarn },
  { key: 'week', color: colors.positive },
  { key: 'later', color: colors.textFaint },
]

function dateToBucket(due, now) {
  if (Number.isNaN(+due)) return null
  if (due < now) return 'overdue'
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7)
  if (due < tomorrow) return 'today'
  if (due < weekEnd) return 'week'
  return 'later'
}

// Tasks + Reminders screen (mirrors web screens/tasks): entity toggle, glass
// hero, filter (+ group-by for tasks), and collapsible glass-card groups.
export default function TasksScreen() {
  const { tasks, loading: tLoading, error: tError, addTask, toggleDone, updateTask, deleteTask, clearCompleted: clearTasks, refetch: refetchTasks } = useTasksList()
  const { reminders, loading: rLoading, error: rError, addReminder, editReminder, completeReminder, deleteReminder, clearCompleted: clearRems, refetch: refetchRems } = useRemindersList()
  const { clients, projects, taskStatuses } = useFormOptions()
  const taxonomy = useTaskTaxonomy()
  const taskCategories = taxonomy.taskCategories
  const [view, setView] = useState('tasks')
  const [adding, setAdding] = useState(false)
  const [editTask, setEditTask] = useState(null)
  const [editRem, setEditRem] = useState(null)
  const [filter, setFilter] = useState('todo')
  const [groupBy, setGroupBy] = useState('priority')
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [categoryFilters, setCategoryFilters] = useState(() => new Set())
  const [showTaxonomy, setShowTaxonomy] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const toggleGroup = (k) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const toggleCategory = (id) => setCategoryFilters((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const isTasks = view === 'tasks'
  const switchView = (v) => { setView(v); setFilter('todo') }
  const clientById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.name])), [clients])
  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects])
  const statusById = useMemo(() => Object.fromEntries((taskStatuses || []).map((s) => [s.id, s])), [taskStatuses])
  const categoryById = useMemo(() => Object.fromEntries(taskCategories.map((c) => [c.id, c])), [taskCategories])
  const now = useMemo(() => new Date(), [tasks, reminders, view, filter])
  const remClient = (r) => (r.linked_to_type === 'client' ? clientById[r.linked_to_id] : null)
  const catMatch = (row) => !categoryFilters.size || categoryFilters.has(row.category_id)

  const loading = isTasks ? tLoading : rLoading
  const error = isTasks ? tError : rError
  const openCount = isTasks ? tasks.filter((t) => t.status !== 'done').length : reminders.filter((r) => r.status !== 'completed').length
  const doneCount = isTasks ? tasks.filter((t) => t.status === 'done').length : reminders.filter((r) => r.status === 'completed').length
  const urgentCount = isTasks
    ? tasks.filter((t) => t.status !== 'done' && t.priority === 'high').length
    : reminders.filter((r) => r.status !== 'completed' && new Date(r.scheduled_at) < now).length

  // ── task groups ──
  const filteredTasks = useMemo(() => {
    let list = tasks
    if (filter === 'todo') list = list.filter((t) => t.status !== 'done')
    else if (filter === 'done') list = list.filter((t) => t.status === 'done')
    if (categoryFilters.size) list = list.filter((t) => categoryFilters.has(t.category_id))
    return list
  }, [tasks, filter, categoryFilters])
  const taskGroups = useMemo(() => {
    if (groupBy === 'project') {
      const gs = projects.map((p) => ({ key: `p-${p.id}`, label: p.name, color: p.color || FALLBACK, items: filteredTasks.filter((t) => t.project_id === p.id) }))
      const none = filteredTasks.filter((t) => !t.project_id || !projects.some((p) => p.id === t.project_id))
      if (none.length) gs.push({ key: 'p-none', label: i18n.t('tasks:groupBy.noProject', { defaultValue: 'ללא פרויקט' }), color: FALLBACK, items: none })
      return gs.filter((g) => g.items.length)
    }
    if (groupBy === 'category') {
      const gs = taskCategories.map((c) => ({ key: `c-${c.id}`, label: c.name, color: c.color || FALLBACK, items: filteredTasks.filter((t) => t.category_id === c.id) }))
      const none = filteredTasks.filter((t) => !t.category_id || !taskCategories.some((c) => c.id === t.category_id))
      if (none.length) gs.push({ key: 'c-none', label: i18n.t('tasks:groupBy.noCategory', { defaultValue: 'ללא קטגוריה' }), color: FALLBACK, items: none })
      return gs.filter((g) => g.items.length)
    }
    return PRIORITY_GROUPS
      .map((g) => ({ key: `pri-${g}`, label: i18n.t(`tasks:priority.${g}`), color: PRIORITY_COLOR[g], items: filteredTasks.filter((t) => (t.priority || 'medium') === g) }))
      .filter((g) => g.items.length)
  }, [groupBy, filteredTasks, projects, taskCategories])

  // ── reminder groups ──
  const reminderGroups = useMemo(() => {
    if (isTasks) return []
    if (filter === 'recurring') {
      const rec = reminders.filter((r) => isRecurring(r) && isActiveReminder(r))
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
      const items = reminders.filter((r) => r.status === 'completed' && catMatch(r))
      return items.length ? [{ key: 'done', label: i18n.t('tasks:doneGroup', { defaultValue: 'הושלמו' }), color: colors.textSub, items }] : []
    }
    // todo → active reminders + dated open tasks, both bucketed by due date
    const active = reminders.filter((r) => isActiveReminder(r) && catMatch(r) && (isRecurring(r) ? dueOccurrenceCount(r, now) >= 1 : true))
    const dated = tasks.filter((t) => t.due_at && t.status !== 'done' && catMatch(t))
    return REM_BUCKETS
      .map((b) => ({
        key: b.key,
        label: i18n.t(`tasks:buckets.${b.key}`),
        color: b.color,
        items: active.filter((r) => dateToBucket(new Date(r.scheduled_at), now) === b.key),
        datedTasks: dated.filter((t) => dateToBucket(new Date(t.due_at), now) === b.key),
      }))
      .filter((g) => g.items.length || g.datedTasks.length)
  }, [isTasks, filter, reminders, tasks, now, categoryFilters]) // eslint-disable-line react-hooks/exhaustive-deps

  const groups = isTasks ? taskGroups : reminderGroups
  const filters = isTasks ? TASK_FILTERS : REM_FILTERS

  return (
    <Screen name="tasks">
      {loading && !(isTasks ? tasks.length : reminders.length) ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={isTasks ? refetchTasks : refetchRems} tintColor={colors.brand} />}
        >
          <ScreenHead
            title={isTasks ? i18n.t('tasks:tasks') : i18n.t('tasks:reminders')}
            meta={[
              isTasks ? i18n.t('tasks:meta.open', { n: openCount }) : i18n.t('tasks:meta.openReminders', { n: openCount }),
              i18n.t('tasks:meta.done', { n: doneCount }),
            ]}
            tagline={i18n.t('tasks:tagline')}
            onAdd={() => setAdding(true)}
            addLabel={isTasks ? i18n.t('tasks:add.taskAria') : i18n.t('tasks:add.reminderAria')}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Entity toggle */}
          <Segmented options={[{ k: 'tasks', label: i18n.t('tasks:tasks') }, { k: 'reminders', label: i18n.t('tasks:reminders') }]} value={view} onPick={switchView} />

          <Card padded={false} contentStyle={styles.hero}>
            <Text style={styles.heroTitle}>{isTasks ? i18n.t('tasks:hero.tasksTitle') : i18n.t('tasks:hero.remindersTitle')}</Text>
            <View style={styles.heroGrid}>
              <HeroStat label={i18n.t('tasks:hero.open')} value={openCount} />
              <HeroStat label={isTasks ? i18n.t('tasks:hero.urgentTasks') : i18n.t('tasks:hero.overdueReminders')} value={urgentCount} accent divided />
              <HeroStat label={i18n.t('tasks:hero.done')} value={doneCount} />
            </View>
          </Card>

          <Segmented options={filters.map((f) => ({ k: f, label: i18n.t(`tasks:filter.${f}`) }))} value={filter} onPick={setFilter} />
          {isTasks ? (
            <Segmented options={GROUP_BY.map((g) => ({ k: g, label: i18n.t(`tasks:groupBy.${g}`) }))} value={groupBy} onPick={setGroupBy} />
          ) : null}

          {/* Category filter + manage — shared across tasks + reminders */}
          <View style={styles.catBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catPills}>
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
          {filter === 'done' && doneCount > 0 ? (
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
                    <Text style={styles.groupCount}>{g.items.length + (g.datedTasks ? g.datedTasks.length : 0)}</Text>
                    <ChevronDown size={16} strokeWidth={1.6} color={colors.textSub} style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }} />
                  </Pressable>
                  {isOpen ? (
                    <View style={styles.groupBody}>
                      {isTasks
                        ? g.items.map((t, i) => (
                          <TaskRow key={t.id} task={t} first={i === 0} clientById={clientById} projectById={projectById} status={statusById[t.status_id]} category={categoryById[t.category_id]} onToggle={() => toggleDone(t)} onEdit={() => setEditTask(t)} />
                        ))
                        : (
                          <>
                            {g.items.map((r, i) => (
                              <ReminderRow key={r.id} reminder={r} first={i === 0} clientName={remClient(r)} count={filter === 'todo' && isRecurring(r) ? dueOccurrenceCount(r, now) : 1} onComplete={() => completeReminder(r)} onEdit={() => setEditRem(r)} />
                            ))}
                            {(g.datedTasks || []).map((t, i) => (
                              <TaskRow key={t.id} task={t} first={g.items.length === 0 && i === 0} clientById={clientById} projectById={projectById} status={statusById[t.status_id]} category={categoryById[t.category_id]} onToggle={() => toggleDone(t)} onEdit={() => setEditTask(t)} />
                            ))}
                          </>
                        )}
                    </View>
                  ) : null}
                </Card>
              )
            })
          ) : (
            <Text style={styles.empty}>{emptyMsg(isTasks, filter)}</Text>
          )}
        </ScrollView>
      )}

      {/* Add — task or reminder per view */}
      {isTasks ? (
        <AddTaskModal open={adding} onClose={() => setAdding(false)} onSave={addTask} />
      ) : (
        <AddReminderModal open={adding} onClose={() => setAdding(false)} onSave={addReminder} />
      )}
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
      <Sheet open={confirmClear} onClose={() => setConfirmClear(false)} title={i18n.t(isTasks ? 'tasks:clearConfirm.tasksTitle' : 'tasks:clearConfirm.remindersTitle', { defaultValue: i18n.t('tasks:clearAll', { defaultValue: 'נקה הכל' }) })}>
        <Text style={styles.confirmMsg}>
          {i18n.t(
            doneCount === 1
              ? (isTasks ? 'tasks:clearConfirm.tasksMessageOne' : 'tasks:clearConfirm.remindersMessageOne')
              : (isTasks ? 'tasks:clearConfirm.tasksMessageMany' : 'tasks:clearConfirm.remindersMessageMany'),
            { count: doneCount, defaultValue: '' },
          )}
        </Text>
        <View style={styles.confirmActions}>
          <Pressable style={styles.confirmCancel} onPress={() => setConfirmClear(false)}><Text style={styles.confirmCancelText}>{i18n.t('modalsTask:common.cancel', { defaultValue: 'ביטול' })}</Text></Pressable>
          <Pressable style={styles.confirmDelete} onPress={() => { (isTasks ? clearTasks : clearRems)(); setConfirmClear(false) }}>
            <Text style={styles.confirmDeleteText}>{i18n.t('tasks:clearConfirm.confirm', { defaultValue: i18n.t('tasks:clearAll', { defaultValue: 'נקה הכל' }) })}</Text>
          </Pressable>
        </View>
      </Sheet>
    </Screen>
  )
}

function emptyMsg(isTasks, filter) {
  if (isTasks) return i18n.t(filter === 'done' ? 'tasks:empty.tasksDone' : 'tasks:empty.tasksTodo', { defaultValue: '—' })
  if (filter === 'recurring') return i18n.t('tasks:empty.noRecurring', { defaultValue: '—' })
  return i18n.t(filter === 'done' ? 'tasks:empty.remindersDone' : 'tasks:empty.remindersTodo', { defaultValue: '—' })
}

function HeroStat({ label, value, accent, divided }) {
  return (
    <View style={[styles.heroStat, divided && styles.heroStatDivided]}>
      <Text style={styles.heroStatL}>{label}</Text>
      <Text style={[styles.heroStatV, accent && styles.heroStatAccent]}>{value}</Text>
    </View>
  )
}

function Segmented({ options, value, onPick }) {
  return (
    <Glass radius={999} style={styles.seg}>
      {options.map((o) => {
        const on = value === o.k
        return (
          <Pressable key={o.k} style={[styles.segBtn, on && styles.segOn]} onPress={() => onPick(o.k)}>
            <Text style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
          </Pressable>
        )
      })}
    </Glass>
  )
}

function TaskRow({ task, first, clientById, projectById, status, category, onToggle, onEdit }) {
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
      <Pressable onPress={onToggle} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: isDone }}>
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
    </View>
  )
}

function ReminderRow({ reminder, first, clientName, count, onComplete, onEdit }) {
  const isDone = reminder.status === 'completed'
  const meta = [clientName, formatWhen(reminder.scheduled_at)].filter(Boolean).join(' · ')
  const rtl = (i18n.language || '').startsWith('he')
  const flip = rtl && !I18nManager.isRTL
  const align = rtl ? 'right' : 'left'
  return (
    <View style={[styles.row, !first && styles.rowBorder, flip && styles.rowFlip]}>
      <Pressable onPress={() => !isDone && onComplete()} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: isDone }}>
        <View style={[styles.check, isDone && styles.checkOn]}>{isDone ? <Check size={13} strokeWidth={3} color={colors.onBrand} /> : null}</View>
      </Pressable>
      <Pressable style={styles.textWrap} onPress={onEdit}>
        <View style={[styles.titleRow, flip && styles.rowFlip]}>
          <Text style={[styles.text, isDone && styles.textDone, { textAlign: align }]} numberOfLines={2}>{reminder.title || ''}</Text>
          {count > 1 ? <Text style={styles.chip}>×{count}</Text> : null}
        </View>
        {meta ? <Text style={[styles.meta, { textAlign: align }]} numberOfLines={1}>{meta}</Text> : null}
      </Pressable>
      <Pressable onPress={onEdit} hitSlop={8}><Pencil size={13} strokeWidth={1.6} color={colors.textFaint} /></Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 96, gap: 12 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 24 },

  hero: { paddingVertical: 16, paddingHorizontal: 12, gap: 12 },
  heroTitle: { fontSize: 11, fontWeight: '500', color: colors.textSub, letterSpacing: 0.4, textAlign: 'center' },
  heroGrid: { flexDirection: 'row' },
  heroStat: { flex: 1, alignItems: 'center', gap: 4 },
  heroStatDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.divider },
  heroStatL: { fontSize: 9, fontWeight: '500', color: colors.textSub, letterSpacing: 0.4, textTransform: 'uppercase' },
  heroStatV: { fontSize: 22, fontWeight: '500', color: colors.text },
  heroStatAccent: { color: colors.brand },

  seg: { flexDirection: 'row', padding: 2, alignSelf: 'center' },
  segBtn: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: 999 },
  segOn: { backgroundColor: colors.brand },
  segText: { fontSize: 12, color: colors.textSub },
  segTextOn: { color: colors.onBrand, fontWeight: '600' },

  // Category filter bar
  catBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catPills: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  catPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 12 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catText: { fontSize: 12, color: colors.textSub },
  catTextOn: { color: colors.onBrand, fontWeight: '600' },
  manageBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 12 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, alignSelf: 'center', borderColor: 'rgba(181,99,78,0.35)' },
  clearText: { fontSize: 12, fontWeight: '500', color: colors.danger },
  confirmMsg: { fontSize: 14, color: colors.text, lineHeight: 20 },
  confirmActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  confirmCancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  confirmCancelText: { fontSize: 15, color: colors.textSub },
  confirmDelete: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.danger, alignItems: 'center' },
  confirmDeleteText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },

  groupOuter: { marginTop: 0 },
  group: {},
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 14 },
  groupDot: { width: 10, height: 10, borderRadius: 5 },
  groupLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  groupCount: { fontSize: 11, fontWeight: '500', color: colors.textSub, backgroundColor: colors.fillStrong, borderRadius: 10, paddingVertical: 1, paddingHorizontal: 8, overflow: 'hidden' },
  groupBody: { paddingHorizontal: 14, paddingBottom: 6 },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 11 },
  rowFlip: { flexDirection: 'row-reverse' },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkOn: { backgroundColor: colors.positive, borderColor: colors.positive },
  textWrap: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
  textDone: { color: colors.textFaint, textDecorationLine: 'line-through' },
  chip: { fontSize: 10, color: colors.textSub, backgroundColor: colors.fill, borderRadius: 8, paddingVertical: 1, paddingHorizontal: 7, overflow: 'hidden' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  catTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 1, paddingHorizontal: 7, borderRadius: 8, backgroundColor: colors.fill },
  catTagDot: { width: 6, height: 6, borderRadius: 3 },
  catTagText: { fontSize: 10, color: colors.textSub },
  meta: { fontSize: 12, color: colors.textFaint },
  metaOverdue: { color: colors.amberWarn },
})

HeroStat.displayName = 'HeroStat'
Segmented.displayName = 'Segmented'
TaskRow.displayName = 'TaskRow'
ReminderRow.displayName = 'ReminderRow'
