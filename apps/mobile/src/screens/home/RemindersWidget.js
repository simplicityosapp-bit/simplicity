import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { remindersUpcoming, formatWhen } from '@simplicity/core'
import i18n from '../../lib/i18n'
import Card from '../../components/Card'
import { colors } from '../../theme/theme'

// "תזכורות קרובות" — the next occurrences of pending/triggered reminders
// (shared core remindersUpcoming). Hidden when there are none. Reminders live
// under the Tasks screen (its Reminders tab), so rows tap through to Tasks.
export default function RemindersWidget({ reminders }) {
  const nav = useNavigation()
  const items = useMemo(() => remindersUpcoming(new Date(), reminders), [reminders])
  if (!items.length) return null

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>{i18n.t('home:widgets.reminders.title')}</Text>
        <Pressable onPress={() => nav.navigate('Tasks')} hitSlop={6}>
          <Text style={styles.link}>{i18n.t('home:widgets.reminders.link', { count: items.length })} ›</Text>
        </Pressable>
      </View>
      <Card padded={false}>
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
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  link: { fontSize: 13, color: colors.brand },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  text: { flex: 1, fontSize: 14, color: colors.text },
  when: { fontSize: 13, color: colors.textSub },
})
