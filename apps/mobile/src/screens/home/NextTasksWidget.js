import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { ClipboardList, Check } from 'lucide-react-native'
import { nextTasks, openTasksCount } from '@simplicity/core'
import i18n from '../../lib/i18n'
import WidgetCard from '../../components/WidgetCard'
import { colors } from '../../theme/theme'

// "המשימות הבאות" — the top open tasks by priority (shared core nextTasks), in
// a collapsible card (ClipboardList). Rows tap through to the Tasks screen.
export default function NextTasksWidget({ tasks, onToggle }) {
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
          <View key={task.id || i} style={[styles.row, i > 0 && styles.rowBorder]}>
            <Pressable style={styles.rowMain} onPress={() => nav.navigate('Tasks')}>
              <View style={[styles.dot, task.priority === 'high' ? styles.dotUrgent : styles.dotRegular]} />
              <Text style={styles.text} numberOfLines={1}>{task.title || ''}</Text>
            </Pressable>
            {onToggle ? (
              <Pressable style={styles.check} onPress={() => onToggle(task)} hitSlop={8} accessibilityLabel={i18n.t('home:widgets.nextTasks.markDone', { defaultValue: 'סמן כבוצעה' })}>
                <Check size={13} strokeWidth={2} color={colors.positive} />
              </Pressable>
            ) : null}
          </View>
        ))
      ) : (
        <Text style={styles.empty}>{i18n.t('home:widgets.nextTasks.allDone', { add: i18n.t('home:widgets.nextTasks.addWord') })}</Text>
      )}
    </WidgetCard>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotUrgent: { backgroundColor: colors.danger },
  dotRegular: { backgroundColor: colors.amberWarn },
  text: { flex: 1, fontSize: 14, color: colors.text },
  empty: { padding: 16, fontSize: 14, color: colors.textFaint, textAlign: 'center' },
})
