import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { nextTasks, openTasksCount } from '@simplicity/core'
import i18n from '../../lib/i18n'

// "המשימות הבאות" — the top open tasks by priority (shared core nextTasks).
// Rows + the count link tap through to the Tasks screen (stub for now).
export default function NextTasksWidget({ tasks }) {
  const nav = useNavigation()
  const items = useMemo(() => nextTasks(5, tasks), [tasks])
  const total = useMemo(() => openTasksCount(tasks), [tasks])

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>{i18n.t('home:widgets.nextTasks.title')}</Text>
        <Pressable onPress={() => nav.navigate('Tasks')} hitSlop={6}>
          <Text style={styles.link}>{i18n.t('home:widgets.nextTasks.link', { count: total })} ›</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        {items.length ? (
          items.map((task, i) => (
            <Pressable
              key={task.id || i}
              style={[styles.row, i > 0 && styles.rowBorder]}
              onPress={() => nav.navigate('Tasks')}
            >
              <Text style={[styles.dot, task.priority === 'high' && styles.dotUrgent]}>•</Text>
              <Text style={styles.text} numberOfLines={1}>{task.title || ''}</Text>
            </Pressable>
          ))
        ) : (
          <Text style={styles.empty}>{i18n.t('home:widgets.nextTasks.noOpen')}</Text>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '600', color: '#3a342e' },
  link: { fontSize: 13, color: '#C97B5E' },
  card: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#efe7da', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#f2ece1' },
  dot: { color: '#c9bfb0', fontSize: 18, lineHeight: 18 },
  dotUrgent: { color: '#C97B5E' },
  text: { flex: 1, fontSize: 14, color: '#3a342e' },
  empty: { padding: 16, fontSize: 14, color: '#a89f95', textAlign: 'center' },
})
