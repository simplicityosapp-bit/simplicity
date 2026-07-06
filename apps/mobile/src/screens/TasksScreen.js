import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { Check } from 'lucide-react-native'
import { fmtShortDate, startOfDay } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHeader from '../components/ScreenHeader'
import Card from '../components/Card'
import AddTaskModal from '../modals/AddTaskModal'
import { colors } from '../theme/theme'
import { useFormOptions } from '../lib/formOptions'
import { useTasksList } from '../hooks/useTasksList'

const PORDER = { high: 0, medium: 1, low: 2 }
const byPriority = (a, b) => (PORDER[a.priority] ?? 1) - (PORDER[b.priority] ?? 1)

// Tasks screen — open + done tasks with an optimistic mark-done checkbox; tap a
// row to edit or delete it. Rows show a due-date · client · project meta line
// (overdue due-dates in amber), over the per-screen photo.
export default function TasksScreen() {
  const { tasks, loading, error, toggleDone, updateTask, deleteTask, refetch } = useTasksList()
  const { clients, projects } = useFormOptions()
  const [editing, setEditing] = useState(null)

  const clientById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.name])), [clients])
  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects])

  const { open, done, urgent } = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'done').slice().sort(byPriority)
    const done = tasks.filter((t) => t.status === 'done')
    const urgent = open.filter((t) => t.priority === 'high').length
    return { open, done, urgent }
  }, [tasks])

  return (
    <Screen name="tasks">
      <ScreenHeader title={i18n.t('tasks:tasks')} />

      {loading && !tasks.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {tasks.length ? (
            <View style={styles.hero}>
              <Stat n={open.length} label={i18n.t('tasks:filters.todo', { defaultValue: 'פתוחות' })} />
              <Stat n={urgent} label={i18n.t('tasks:urgent', { defaultValue: 'דחופות' })} accent />
              <Stat n={done.length} label={i18n.t('tasks:filters.done', { defaultValue: 'הושלמו' })} />
            </View>
          ) : null}

          {open.length ? (
            <Section title={i18n.t('tasks:filters.todo', { defaultValue: 'פתוחות' })}>
              {open.map((t, i) => <Row key={t.id} task={t} first={i === 0} clientById={clientById} projectById={projectById} onToggle={() => toggleDone(t)} onEdit={() => setEditing(t)} />)}
            </Section>
          ) : (
            <Text style={styles.empty}>{i18n.t('home:widgets.nextTasks.noOpen')}</Text>
          )}

          {done.length ? (
            <Section title={i18n.t('tasks:filters.done', { defaultValue: 'הושלמו' })}>
              {done.map((t, i) => <Row key={t.id} task={t} first={i === 0} clientById={clientById} projectById={projectById} onToggle={() => toggleDone(t)} onEdit={() => setEditing(t)} />)}
            </Section>
          ) : null}
        </ScrollView>
      )}

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

function Stat({ n, label, accent }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statNum, accent && styles.statNumAccent]}>{n}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Card padded={false}>{children}</Card>
    </View>
  )
}

function Row({ task, first, clientById, projectById, onToggle, onEdit }) {
  const isDone = task.status === 'done'
  const overdue = !isDone && task.due_at && new Date(task.due_at) < startOfDay(new Date())
  const meta = [
    task.due_at ? fmtShortDate(task.due_at) : null,
    clientById[task.client_id],
    projectById[task.project_id],
  ].filter(Boolean).join(' · ')
  return (
    <View style={[styles.row, !first && styles.rowBorder]}>
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isDone }}
        accessibilityLabel={i18n.t('home:widgets.nextTasks.markDone')}
      >
        <View style={[styles.check, isDone && styles.checkOn]}>{isDone ? <Check size={13} strokeWidth={3} color={colors.onBrand} /> : null}</View>
      </Pressable>
      {!isDone && task.priority === 'high' ? <View style={styles.dot} /> : null}
      <Pressable style={styles.textWrap} onPress={onEdit}>
        <Text style={[styles.text, isDone && styles.textDone]} numberOfLines={2}>{task.title || ''}</Text>
        {meta ? <Text style={[styles.meta, overdue && styles.metaOverdue]} numberOfLines={1}>{meta}</Text> : null}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 18 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 24 },
  hero: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 2 },
  statNum: { fontSize: 22, fontWeight: '600', color: colors.text },
  statNumAccent: { color: colors.brand },
  statLabel: { fontSize: 12, color: colors.textSub },
  section: { gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.textSub },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#cbb9a8', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.positive, borderColor: colors.positive },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  textWrap: { flex: 1, paddingVertical: 2, gap: 2 },
  text: { fontSize: 14, color: colors.text, lineHeight: 20 },
  textDone: { color: colors.textFaint, textDecorationLine: 'line-through' },
  meta: { fontSize: 12, color: colors.textFaint },
  metaOverdue: { color: colors.amberWarn },
})
