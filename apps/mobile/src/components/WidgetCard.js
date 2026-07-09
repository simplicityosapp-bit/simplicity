import { useState } from 'react'
import { View, Text, Pressable, StyleSheet, I18nManager } from 'react-native'
import { ChevronDown } from 'lucide-react-native'
import i18n from '../lib/i18n'
import Card from './Card'
import { colors } from '../theme/theme'

// Shared collapsible home widget card, matching web's .h-card: a glass card
// with a header row (lucide icon + title + count + chevron) that toggles an
// expandable body. Collapsed → a one-line summary; expanded → the full list.
export default function WidgetCard({ Icon, title, count, summary, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  // Manual flip for the LTR-engine Hebrew state (RN-Web / Expo Go / first launch);
  // no-op on a real RTL device where the engine mirrors rows itself.
  const flip = (i18n.language || '').startsWith('he') && !I18nManager.isRTL
  const textAlign = flip ? 'right' : 'left'
  return (
    <View style={styles.wrap}>
      <Card padded={false}>
        <Pressable style={[styles.head, flip && styles.headFlip]} onPress={() => setOpen((o) => !o)} hitSlop={4}>
          {Icon ? <Icon size={18} strokeWidth={1.6} color={colors.textSub} /> : null}
          <Text style={[styles.title, { textAlign }]} numberOfLines={1}>{title}</Text>
          {count != null ? <Text style={styles.count}>{count}</Text> : null}
          <ChevronDown size={18} strokeWidth={1.6} color={colors.textFaint} style={open ? styles.chevOpen : null} />
        </Pressable>
        {open ? (
          <View style={styles.body}>{children}</View>
        ) : summary ? (
          <Pressable onPress={() => setOpen(true)}>
            <Text style={[styles.summary, { textAlign }]} numberOfLines={1}>{summary}</Text>
          </Pressable>
        ) : null}
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 15, paddingHorizontal: 16 },
  headFlip: { flexDirection: 'row-reverse' },
  title: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.text },
  count: { fontSize: 13, color: colors.textSub },
  chevOpen: { transform: [{ rotate: '180deg' }] },
  body: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  summary: { paddingHorizontal: 16, paddingBottom: 15, marginTop: -4, fontSize: 13, color: colors.textSub },
})
