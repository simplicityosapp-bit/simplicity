import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import i18n from '../lib/i18n'
import { useTasksList } from '../hooks/useTasksList'

const PORDER = { high: 0, medium: 1, low: 2 }
const byPriority = (a, b) => (PORDER[a.priority] ?? 1) - (PORDER[b.priority] ?? 1)

// First real feature screen (replaces the Tasks stub). Lists open + done tasks
// with an optimistic mark-done checkbox. Reached from the home widgets.
export default function TasksScreen() {
  const nav = useNavigation()
  const { tasks, loading, error, toggleDone, refetch } = useTasksList()

  const { open, done } = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'done').slice().sort(byPriority)
    const done = tasks.filter((t) => t.status === 'done')
    return { open, done }
  }, [tasks])

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <Pressable onPress={() => nav.goBack()} hitSlop={10}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.title}>{i18n.t('tasks:tasks')}</Text>
        <View style={styles.spacer} />
      </View>

      {loading && !tasks.length ? (
        <View style={styles.center}><ActivityIndicator color="#C97B5E" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#C97B5E" />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {open.length ? (
            <Section title={i18n.t('tasks:filters.todo', { defaultValue: 'פתוחות' })}>
              {open.map((t) => <Row key={t.id} task={t} onToggle={() => toggleDone(t)} />)}
            </Section>
          ) : (
            <Text style={styles.empty}>{i18n.t('home:widgets.nextTasks.noOpen')}</Text>
          )}

          {done.length ? (
            <Section title={i18n.t('tasks:filters.done', { defaultValue: 'הושלמו' })}>
              {done.map((t) => <Row key={t.id} task={t} onToggle={() => toggleDone(t)} />)}
            </Section>
          ) : null}
        </ScrollView>
      )}
    </View>
  )
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  )
}

function Row({ task, onToggle }) {
  const isDone = task.status === 'done'
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isDone }}
        accessibilityLabel={i18n.t('home:widgets.nextTasks.markDone')}
      >
        <View style={[styles.check, isDone && styles.checkOn]}>{isDone ? <Text style={styles.checkMark}>✓</Text> : null}</View>
      </Pressable>
      {!isDone && task.priority === 'high' ? <Text style={styles.dot}>•</Text> : null}
      <Text style={[styles.text, isDone && styles.textDone]} numberOfLines={2}>{task.title || ''}</Text>
    </View>
  )
}

const BRAND = '#C97B5E'
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fbf7f2' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: 12, paddingHorizontal: 16, gap: 8 },
  back: { fontSize: 30, color: BRAND, lineHeight: 30 },
  title: { fontSize: 18, fontWeight: '600', color: '#3a342e', flex: 1, textAlign: 'center' },
  spacer: { width: 30 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 18 },
  error: { color: '#c0392b', fontSize: 13 },
  empty: { color: '#a89f95', fontSize: 14, textAlign: 'center', marginTop: 24 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#7c6f63' },
  card: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#efe7da', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#f2ece1' },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#cbb9a8', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: '#8BA888', borderColor: '#8BA888' },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  dot: { color: BRAND, fontSize: 18, lineHeight: 18 },
  text: { flex: 1, fontSize: 14, color: '#3a342e', lineHeight: 20 },
  textDone: { color: '#b3a99c', textDecorationLine: 'line-through' },
})
