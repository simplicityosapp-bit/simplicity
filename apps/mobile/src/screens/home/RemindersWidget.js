import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { remindersUpcoming, formatWhen } from '@simplicity/core'
import i18n from '../../lib/i18n'

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
      <View style={styles.card}>
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#f2ece1' },
  text: { flex: 1, fontSize: 14, color: '#3a342e' },
  when: { fontSize: 13, color: '#7c6f63' },
})
