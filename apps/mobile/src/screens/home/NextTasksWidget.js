import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { ClipboardList } from 'lucide-react-native'
import { nextTasks, openTasksCount } from '@simplicity/core'
import i18n from '../../lib/i18n'
import WidgetCard from '../../components/WidgetCard'
import { colors } from '../../theme/theme'

// "המשימות הבאות" — the top open tasks by priority (shared core nextTasks), in
// a collapsible card (ClipboardList). Rows tap through to the Tasks screen.
export default function NextTasksWidget({ tasks }) {
  const nav = useNavigation()
  const items = useMemo(() => nextTasks(999, tasks), [tasks])
  const total = useMemo(() => openTasksCount(tasks), [tasks])
  const urgent = useMemo(() => items.filter((t) => t.priority === 'high').length, [items])

  const summary = total === 0
    ? i18n.t('home:widgets.nextTasks.noOpen')
    : urgent > 0
      ? i18n.t('home:widgets.nextTasks.urgentOf', { urgentText: i18n.t('home:widgets.nextTasks.urgent', { count: urgent }), count: total })
      : i18n.t('home:widgets.nextTasks.openSummary', { count: total })

  return (
    <WidgetCard Icon={ClipboardList} title={i18n.t('home:widgets.nextTasks.title')} count={total ? i18n.t('home:widgets.nextTasks.link', { count: total }) : null} summary={summary}>
      {items.length ? (
        items.map((task, i) => (
          <Pressable
            key={task.id || i}
            style={[styles.row, i > 0 && styles.rowBorder]}
            onPress={() => nav.navigate('Tasks')}
          >
            <View style={[styles.dot, task.priority === 'high' ? styles.dotUrgent : styles.dotRegular]} />
            <Text style={styles.text} numberOfLines={1}>{task.title || ''}</Text>
          </Pressable>
        ))
      ) : (
        <Text style={styles.empty}>{i18n.t('home:widgets.nextTasks.allDone', { add: i18n.t('home:widgets.nextTasks.addWord') })}</Text>
      )}
    </WidgetCard>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotUrgent: { backgroundColor: colors.danger },
  dotRegular: { backgroundColor: colors.amberWarn },
  text: { flex: 1, fontSize: 14, color: colors.text },
  empty: { padding: 16, fontSize: 14, color: colors.textFaint, textAlign: 'center' },
})
