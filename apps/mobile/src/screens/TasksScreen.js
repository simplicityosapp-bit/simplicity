import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { Check } from 'lucide-react-native'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHeader from '../components/ScreenHeader'
import Card from '../components/Card'
import { colors } from '../theme/theme'
import { useTasksList } from '../hooks/useTasksList'

const PORDER = { high: 0, medium: 1, low: 2 }
const byPriority = (a, b) => (PORDER[a.priority] ?? 1) - (PORDER[b.priority] ?? 1)

// Tasks screen — open + done tasks with an optimistic mark-done checkbox, over
// the per-screen photo (Warm Precision theme).
export default function TasksScreen() {
  const { tasks, loading, error, toggleDone, refetch } = useTasksList()

  const { open, done } = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'done').slice().sort(byPriority)
    const done = tasks.filter((t) => t.status === 'done')
    return { open, done }
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

          {open.length ? (
            <Section title={i18n.t('tasks:filters.todo', { defaultValue: 'פתוחות' })}>
              {open.map((t, i) => <Row key={t.id} task={t} first={i === 0} onToggle={() => toggleDone(t)} />)}
            </Section>
          ) : (
            <Text style={styles.empty}>{i18n.t('home:widgets.nextTasks.noOpen')}</Text>
          )}

          {done.length ? (
            <Section title={i18n.t('tasks:filters.done', { defaultValue: 'הושלמו' })}>
              {done.map((t, i) => <Row key={t.id} task={t} first={i === 0} onToggle={() => toggleDone(t)} />)}
            </Section>
          ) : null}
        </ScrollView>
      )}
    </Screen>
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

function Row({ task, first, onToggle }) {
  const isDone = task.status === 'done'
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
      <Text style={[styles.text, isDone && styles.textDone]} numberOfLines={2}>{task.title || ''}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 18 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 24 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.textSub },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#cbb9a8', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.positive, borderColor: colors.positive },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  text: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
  textDone: { color: colors.textFaint, textDecorationLine: 'line-through' },
})
