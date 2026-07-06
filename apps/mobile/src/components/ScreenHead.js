import { Fragment } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Plus, ChevronLeft } from 'lucide-react-native'
import Card from './Card'
import { colors, shadow } from '../theme/theme'

// Shared screen header (mirrors the web .screen-top): a glass card holding the
// big title + optional meta chips + tagline, beside a large circular terracotta
// "+" FAB. GLOBAL — feature screens use this instead of hand-rolling a head so
// the header + add button stay identical everywhere. On pushed (drill-in)
// screens it auto-shows a back chevron above the card (the web has persistent
// nav; mobile pops the stack). Pass back={false} to force it off.
export default function ScreenHead({ title, meta = [], tagline, onAdd, addLabel, back }) {
  const nav = useNavigation()
  const showBack = back ?? nav.canGoBack()
  return (
    <View style={styles.wrap}>
      {showBack ? (
        <Pressable style={styles.back} onPress={() => nav.goBack()} hitSlop={10} accessibilityRole="button">
          <ChevronLeft size={26} strokeWidth={1.8} color={colors.brand} />
        </Pressable>
      ) : null}
      <View style={styles.top}>
        <Card padded={false} contentStyle={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {meta.length ? (
            <View style={styles.metaRow}>
              {meta.map((m, i) => (
                <Fragment key={i}>
                  {i > 0 ? <Text style={styles.dot}>·</Text> : null}
                  <Text style={styles.lbl}>{m}</Text>
                </Fragment>
              ))}
            </View>
          ) : null}
          {tagline ? <Text style={styles.tagline}>{tagline}</Text> : null}
        </Card>
        {onAdd ? (
          <View style={styles.fabSlot}>
            <Pressable style={styles.fab} onPress={onAdd} hitSlop={8} accessibilityLabel={addLabel} accessibilityRole="button">
              <Plus size={38} strokeWidth={2} color={colors.onBrand} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 52 },
  back: { paddingHorizontal: 16, paddingBottom: 4, alignSelf: 'flex-start' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 4, marginBottom: 16 },
  // Glass card, ~62% like the web .screen-head; title on top, meta + tagline below.
  card: { flexBasis: '62%', flexShrink: 1, maxWidth: 280, paddingVertical: 16, paddingHorizontal: 18, alignItems: 'flex-start', gap: 6 },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5, lineHeight: 27, color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  lbl: { fontSize: 10, fontWeight: '500', letterSpacing: 0.4, color: colors.textSub, textTransform: 'uppercase' },
  dot: { fontSize: 10, color: colors.textSub, opacity: 0.4 },
  tagline: { fontSize: 11, fontWeight: '500', color: colors.textSub },
  // Terracotta circular FAB centered in the remaining space (web .cta-add, 72px).
  fabSlot: { flex: 1, alignItems: 'center' },
  fab: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', ...shadow.card },
})
