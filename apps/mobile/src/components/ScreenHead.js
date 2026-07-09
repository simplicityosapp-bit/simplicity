import { Fragment } from 'react'
import { View, Text, Pressable, StyleSheet, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Plus } from 'lucide-react-native'
import Card from './Card'
import i18n from '../lib/i18n'
import { colors, shadow } from '../theme/theme'

// Shared screen header (mirrors the web .screen-top): a glass card holding the
// big title + optional meta chips + tagline, beside a large circular terracotta
// "+" FAB that is vertically CENTERED against the card (web `.screen-top`
// align-items:center). GLOBAL — feature screens use this so the header + add
// button stay identical everywhere.
//
// No back arrow: the app-level bottom bar (with the "עוד" menu) is always visible
// — even on pushed drill-in screens — so every screen is reachable from the nav
// and a per-screen back chevron is redundant.
//
// RTL: the app is Hebrew-first, but RN's I18nManager.forceRTL only applies after
// a restart (and RN Web ignores it) — so a Hebrew UI can render with an LTR
// engine. We flip the header explicitly whenever Hebrew is wanted but the engine
// isn't RTL yet, so the title sits flush-right and the "+" moves to the start
// edge in both environments (and never double-flips on a truly-RTL device).
export default function ScreenHead({ title, meta = [], tagline, onAdd, addLabel }) {
  const insets = useSafeAreaInsets()
  const rtl = (i18n.language || '').startsWith('he')
  const flip = rtl && !I18nManager.isRTL
  const align = { textAlign: rtl ? 'right' : 'left' }
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 14 }]}>
      <View style={[styles.top, flip && styles.topFlip]}>
        <Card padded={false} contentStyle={styles.card}>
          <Text style={[styles.title, align]}>{title}</Text>
          {meta.length ? (
            <View style={[styles.metaRow, flip && styles.rowFlip]}>
              {meta.map((m, i) => (
                <Fragment key={i}>
                  {i > 0 ? <Text style={styles.dot}>·</Text> : null}
                  <Text style={styles.lbl}>{m}</Text>
                </Fragment>
              ))}
            </View>
          ) : null}
          {tagline ? <Text style={[styles.tagline, align]}>{tagline}</Text> : null}
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
  // Lives as the first child inside each screen's scroll content (so it scrolls
  // with the page, like web — not pinned). The content container pads 20
  // horizontally + has a row gap; the head only owns the top clearance
  // (status bar via insets + web's 14px margin), tight to the top like web.
  wrap: {},
  // Card + FAB row. align-items:center → the "+" is vertically centered against
  // the card (mirrors web .screen-top), consistently across every screen.
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  topFlip: { flexDirection: 'row-reverse' },
  // Glass card, ~62% like the web .screen-head; title on top, meta + tagline below.
  card: { flexBasis: '62%', flexShrink: 1, maxWidth: 280, paddingTop: 16, paddingBottom: 14, paddingHorizontal: 18, alignItems: 'stretch', gap: 6 },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5, lineHeight: 26, color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowFlip: { flexDirection: 'row-reverse' },
  lbl: { fontSize: 10, fontWeight: '500', letterSpacing: 0.4, color: colors.textSub, textTransform: 'uppercase' },
  dot: { fontSize: 10, color: colors.textSub, opacity: 0.4 },
  tagline: { fontSize: 11, fontWeight: '500', color: colors.textSub },
  // Terracotta circular FAB centered in the remaining space (web .cta-add, 72px).
  fabSlot: { flex: 1, alignItems: 'center' },
  fab: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', ...shadow.card },
})
