import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { Check, ChevronDown } from 'lucide-react-native'
import { fmtShortDate, startOfDay } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import { Glass } from '../components/Glass'
import AddTaskModal from '../modals/AddTaskModal'
import { colors } from '../theme/theme'
import { useFormOptions } from '../lib/formOptions'
import { useTasksList } from '../hooks/useTasksList'

const PRIORITY_COLOR = { high: colors.danger, medium: colors.amberWarn, low: colors.positive }
const PRIORITY_GROUPS = ['high', 'medium', 'low']
const FILTERS = ['todo', 'done', 'all']
const GROUP_BY = ['priority', 'project']
const FALLBACK = colors.textFaint

// Tasks screen (mirrors web screens/tasks): screen-head + add, a glass hero
// (open · urgent · done), filter (todo/done/all) + group-by (priority/project)
// toggles, and collapsible glass-card groups of tasks. Tap a row's check to
// mark done, tap the row to edit. (Reminders entity view + category taxonomy
// are a later increment.)
export default function TasksScreen() {
  const { tasks, loading, error, addTask, toggleDone, updateTask, deleteTask, refetch } = useTasksList()
  const { clients, projects, taskStatuses } = useFormOptions()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('todo')
  const [groupBy, setGroupBy] = useState('priority')
  const [collapsed, setCollapsed] = useState(() => new Set())
  const toggleGroup = (k) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const clientById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.name])), [clients])
  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects])
  const statusById = useMemo(() => Object.fromEntries((taskStatuses || []).map((s) => [s.id, s])), [taskStatuses])

  const openCount = tasks.filter((t) => t.status !== 'done').length
  const doneCount = tasks.filter((t) => t.status === 'done').length
  const urgentCount = tasks.filter((t) => t.status !== 'done' && t.priority === 'high').length

  const filtered = useMemo(() => {
    if (filter === 'todo') return tasks.filter((t) => t.status !== 'done')
    if (filter === 'done') return tasks.filter((t) => t.status === 'done')
    return tasks
  }, [tasks, filter])

  const groups = useMemo(() => {
    if (groupBy === 'project') {
      const gs = projects.map((p) => ({ key: `p-${p.id}`, label: p.name, color: p.color || FALLBACK, items: filtered.filter((t) => t.project_id === p.id) }))
      const none = filtered.filter((t) => !t.project_id || !projects.some((p) => p.id === t.project_id))
      if (none.length) gs.push({ key: 'p-none', label: i18n.t('tasks:groupBy.noProject', { defaultValue: 'ללא פרויקט' }), color: FALLBACK, items: none })
      return gs.filter((g) => g.items.length)
    }
    return PRIORITY_GROUPS
      .map((g) => ({ key: `pri-${g}`, label: i18n.t(`tasks:priority.${g}`), color: PRIORITY_COLOR[g], items: filtered.filter((t) => (t.priority || 'medium') === g) }))
      .filter((g) => g.items.length)
  }, [groupBy, filtered, projects])

  return (
    <Screen name="tasks">
      <ScreenHead
        title={i18n.t('tasks:tasks')}
        meta={[i18n.t('tasks:meta.open', { n: openCount }), i18n.t('tasks:meta.done', { n: doneCount })]}
        tagline={i18n.t('tasks:tagline')}
        onAdd={() => setAdding(true)}
        addLabel={i18n.t('tasks:add.taskAria')}
      />

      {loading && !tasks.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {tasks.length ? (
            <Card padded={false} contentStyle={styles.hero}>
              <Text style={styles.heroTitle}>{i18n.t('tasks:hero.tasksTitle')}</Text>
              <View style={styles.heroGrid}>
                <HeroStat label={i18n.t('tasks:hero.open')} value={openCount} />
                <HeroStat label={i18n.t('tasks:hero.urgentTasks')} value={urgentCount} accent divided />
                <HeroStat label={i18n.t('tasks:hero.done')} value={doneCount} />
              </View>
            </Card>
          ) : null}

          <Segmented options={FILTERS.map((f) => ({ k: f, label: i18n.t(`tasks:filter.${f}`) }))} value={filter} onPick={setFilter} />
          <Segmented options={GROUP_BY.map((g) => ({ k: g, label: i18n.t(`tasks:groupBy.${g}`) }))} value={groupBy} onPick={setGroupBy} />

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
                      {g.items.map((t, i) => (
                        <Row key={t.id} task={t} first={i === 0} clientById={clientById} projectById={projectById} status={statusById[t.status_id]} onToggle={() => toggleDone(t)} onEdit={() => setEditing(t)} />
                      ))}
                    </View>
                  ) : null}
                </Card>
              )
            })
          ) : (
            <Text style={styles.empty}>{i18n.t(filter === 'done' ? 'tasks:empty.tasksDone' : 'tasks:empty.tasksTodo', { defaultValue: '—' })}</Text>
          )}
        </ScrollView>
      )}

      <AddTaskModal open={adding} onClose={() => setAdding(false)} onSave={addTask} />
      <AddTaskModal
        open={!!editing}
        task={editing}
        onClose={() => setEditing(null)}
        onSave={(patch) => updateTask(editing.id, patch)}
        onDelete={() => deleteTask(editing.id)}
      />
    </Screen>
  )
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

function Row({ task, first, clientById, projectById, status, onToggle, onEdit }) {
  const isDone = task.status === 'done'
  const overdue = !isDone && task.due_at && new Date(task.due_at) < startOfDay(new Date())
  const meta = [task.due_at ? fmtShortDate(task.due_at) : null, clientById[task.client_id], projectById[task.project_id]].filter(Boolean).join(' · ')
  return (
    <View style={[styles.row, !first && styles.rowBorder]}>
      <Pressable onPress={onToggle} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: isDone }}>
        <View style={[styles.check, isDone && styles.checkOn]}>{isDone ? <Check size={13} strokeWidth={3} color={colors.onBrand} /> : null}</View>
      </Pressable>
      <Pressable style={styles.textWrap} onPress={onEdit}>
        <View style={styles.titleRow}>
          <Text style={[styles.text, isDone && styles.textDone]} numberOfLines={2}>{task.title || ''}</Text>
          {status ? <Text style={styles.statusChip} numberOfLines={1}>{status.icon ? `${status.icon} ` : ''}{status.display_name}</Text> : null}
        </View>
        {meta ? <Text style={[styles.meta, overdue && styles.metaOverdue]} numberOfLines={1}>{meta}</Text> : null}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 24 },

  // Hero
  hero: { paddingVertical: 16, paddingHorizontal: 12, gap: 12 },
  heroTitle: { fontSize: 11, fontWeight: '500', color: colors.textSub, letterSpacing: 0.4, textAlign: 'center' },
  heroGrid: { flexDirection: 'row' },
  heroStat: { flex: 1, alignItems: 'center', gap: 4 },
  heroStatDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.divider },
  heroStatL: { fontSize: 9, fontWeight: '500', color: colors.textSub, letterSpacing: 0.4, textTransform: 'uppercase' },
  heroStatV: { fontSize: 22, fontWeight: '500', color: colors.text },
  heroStatAccent: { color: colors.brand },

  // Segmented toggles
  seg: { flexDirection: 'row', padding: 2, alignSelf: 'flex-start' },
  segBtn: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: 999 },
  segOn: { backgroundColor: colors.brand },
  segText: { fontSize: 12, color: colors.textSub },
  segTextOn: { color: colors.onBrand, fontWeight: '600' },

  // Groups
  groupOuter: { marginTop: 0 },
  group: {},
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 14 },
  groupDot: { width: 10, height: 10, borderRadius: 5 },
  groupLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  groupCount: { fontSize: 11, fontWeight: '500', color: colors.textSub, backgroundColor: 'rgba(42,37,32,0.06)', borderRadius: 10, paddingVertical: 1, paddingHorizontal: 8, overflow: 'hidden' },
  groupBody: { paddingHorizontal: 14, paddingBottom: 6 },

  // Rows
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 11 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#cbb9a8', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkOn: { backgroundColor: colors.positive, borderColor: colors.positive },
  textWrap: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
  textDone: { color: colors.textFaint, textDecorationLine: 'line-through' },
  statusChip: { fontSize: 10, color: colors.textSub, backgroundColor: 'rgba(42,37,32,0.05)', borderRadius: 8, paddingVertical: 1, paddingHorizontal: 7, overflow: 'hidden' },
  meta: { fontSize: 12, color: colors.textFaint },
  metaOverdue: { color: colors.amberWarn },
})

HeroStat.displayName = 'HeroStat'
Segmented.displayName = 'Segmented'
Row.displayName = 'Row'
