import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { nextTasks, openTasksCount } from '@simplicity/core'
import i18n from '../../lib/i18n'
import Card from '../../components/Card'
import { colors } from '../../theme/theme'

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
      <Card padded={false}>
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
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  link: { fontSize: 13, color: colors.brand },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  dot: { color: colors.textFaint, fontSize: 18, lineHeight: 18 },
  dotUrgent: { color: colors.brand },
  text: { flex: 1, fontSize: 14, color: colors.text },
  empty: { padding: 16, fontSize: 14, color: colors.textFaint, textAlign: 'center' },
})
