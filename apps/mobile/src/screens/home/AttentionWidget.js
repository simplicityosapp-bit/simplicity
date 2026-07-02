import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { attentionItems } from '@simplicity/core'
import i18n from '../../lib/i18n'

// "דרושה תשומת לב" — action items derived by shared core attentionItems.
// Each row's semantic `target` maps to a navigator screen (stub for now).
const TARGET_SCREEN = {
  finance: 'Finance', calendar: 'Calendar', clients: 'Clients',
  goals: 'Goals', tasks: 'Tasks', leads: 'Leads',
}

export default function AttentionWidget({ data }) {
  const nav = useNavigation()
  const items = useMemo(() => attentionItems(new Date(), data), [data])
  if (!items.length) return null

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{i18n.t('home:widgets.attention.title')}</Text>
      <View style={styles.card}>
        {items.map((it, i) => (
          <Pressable
            key={`${it.target}-${it.kind || ''}-${i}`}
            style={[styles.row, i > 0 && styles.rowBorder]}
            onPress={() => {
              const screen = TARGET_SCREEN[it.target]
              if (screen) nav.navigate(screen)
            }}
          >
            <Text style={styles.dot}>•</Text>
            <Text style={styles.text} numberOfLines={2}>{it.text}</Text>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20, gap: 8 },
  title: { fontSize: 15, fontWeight: '600', color: '#3a342e' },
  card: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#efe7da', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#f2ece1' },
  dot: { color: '#C97B5E', fontSize: 18, lineHeight: 18 },
  text: { flex: 1, fontSize: 14, color: '#3a342e', lineHeight: 20 },
  chev: { color: '#c9bfb0', fontSize: 20 },
})
