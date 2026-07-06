import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Clock } from 'lucide-react-native'
import { remindersUpcoming, formatWhen } from '@simplicity/core'
import i18n from '../../lib/i18n'
import WidgetCard from '../../components/WidgetCard'
import { colors } from '../../theme/theme'

// "תזכורות קרובות" — next occurrences of pending/triggered reminders (shared
// core remindersUpcoming), in a collapsible card (Clock). Hidden when none.
// Reminders live under the Tasks screen, so rows tap through to Tasks.
export default function RemindersWidget({ reminders }) {
  const nav = useNavigation()
  const items = useMemo(() => remindersUpcoming(new Date(), reminders), [reminders])
  if (!items.length) return null

  const summary = i18n.t('home:widgets.reminders.soonSummary', { count: items.length })

  return (
    <WidgetCard Icon={Clock} title={i18n.t('home:widgets.reminders.title')} count={i18n.t('home:widgets.reminders.link', { count: items.length })} summary={summary}>
      {items.map((r, i) => (
        <Pressable
          key={r.id || i}
          style={[styles.row, i > 0 && styles.rowBorder]}
          onPress={() => nav.navigate('Tasks')}
        >
          <Text style={styles.text} numberOfLines={1}>{r.title || ''}</Text>
          <Text style={styles.when}>{formatWhen(r.when)}</Text>
        </Pressable>
      ))}
    </WidgetCard>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  text: { flex: 1, fontSize: 14, color: colors.text },
  when: { fontSize: 13, color: colors.textSub },
})
