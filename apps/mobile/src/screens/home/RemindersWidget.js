import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Clock, Check } from 'lucide-react-native'
import { remindersUpcoming, formatWhen } from '@simplicity/core'
import i18n from '../../lib/i18n'
import WidgetCard from '../../components/WidgetCard'
import { colors } from '../../theme/theme'

// "תזכורות קרובות" — next occurrences of pending/triggered reminders (shared
// core remindersUpcoming), in a collapsible card (Clock). Hidden when none.
// Reminders live under the Tasks screen, so rows tap through to Tasks.
export default function RemindersWidget({ reminders, onComplete }) {
  const nav = useNavigation()
  const items = useMemo(() => remindersUpcoming(new Date(), reminders, 60, 0), [reminders]) // all upcoming
  const todayCount = useMemo(() => {
    const now = new Date()
    const isToday = (d) => d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    return items.filter((r) => isToday(new Date(r.when))).length
  }, [items])
  if (!items.length) return null

  const summary = todayCount > 0
    ? i18n.t('home:widgets.reminders.todaySummary', { count: items.length, today: todayCount })
    : i18n.t('home:widgets.reminders.soonSummary', { count: items.length })

  return (
    <WidgetCard Icon={Clock} title={i18n.t('home:widgets.reminders.title')} count={i18n.t('home:widgets.reminders.link', { count: items.length })} summary={summary}>
      {items.map((r, i) => (
        <View key={r.id || i} style={[styles.row, i > 0 && styles.rowBorder]}>
          <Pressable style={styles.rowMain} onPress={() => nav.navigate('Tasks')}>
            <Text style={styles.text} numberOfLines={1}>{r.title || ''}</Text>
            <Text style={styles.when}>{formatWhen(r.when)}</Text>
          </Pressable>
          {onComplete ? (
            <Pressable style={styles.check} onPress={() => onComplete(r.id)} hitSlop={8} accessibilityLabel={i18n.t('home:widgets.reminders.markDoneAria', { defaultValue: 'סמן כבוצעה' })}>
              <Check size={13} strokeWidth={2} color={colors.positive} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </WidgetCard>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 13 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  text: { flex: 1, fontSize: 14, color: colors.text },
  when: { fontSize: 13, color: colors.textSub },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' },
})
