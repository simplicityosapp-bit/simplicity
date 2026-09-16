import { useMemo } from 'react'
import { View, Alert } from 'react-native'
import { ChevronUp, ChevronDown, RotateCcw } from 'lucide-react-native'
import { getAllOrderedMetrics } from '@simplicity/core'
import { Text } from '../components/Text'
import { Pressable } from '../components/Pressable'
import Sheet from '../components/Sheet'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'

const T = (k, o) => i18n.t(`reports:${k}`, o)

/* Which report metrics show, and in what order (web CustomizePanel). Saved to
   prefs.reports — the same layout web reads, so hiding a metric on one shows
   on the other. Arrows rather than drag: there is no drag on touch. Resetting
   throws away a hand-built order, so it asks first. */
export default function ReportsCustomizeSheet({ open, onClose, config, onToggle, onMove, onReset }) {
  const items = useMemo(() => getAllOrderedMetrics(config), [config])
  const visible = useMemo(() => new Set(config.visibleMetrics), [config.visibleMetrics])
  const confirmReset = () => Alert.alert(T('customize.resetTitle'), T('customize.resetConfirm'), [
    { text: i18n.t('modalsData:common.cancel', { defaultValue: 'ביטול' }), style: 'cancel' },
    { text: T('customize.reset'), onPress: onReset },
  ])

  return (
    <Sheet open={open} onClose={onClose} title={T('customize.title')}>
      <View style={styles.head}>
        <Text style={styles.hint}>{T('customize.hint')}</Text>
        <Pressable style={styles.reset} onPress={confirmReset} hitSlop={6} accessibilityRole="button">
          <RotateCcw size={12} strokeWidth={1.6} color={colors.brand} />
          <Text style={styles.resetText}>{T('customize.reset')}</Text>
        </Pressable>
      </View>
      <View style={styles.list}>
        {items.map((m, i) => {
          const on = visible.has(m.id)
          const label = T(`metrics.${m.id}`)
          return (
            <View key={m.id} style={[styles.row, i > 0 && styles.rowBorder]}>
              <Pressable style={styles.move} disabled={i === 0} onPress={() => onMove(m.id, -1)} accessibilityLabel={T('customize.moveUp', { label })} hitSlop={4}>
                <ChevronUp size={16} strokeWidth={1.8} color={i === 0 ? colors.textFaint : colors.textSub} />
              </Pressable>
              <Pressable style={styles.move} disabled={i === items.length - 1} onPress={() => onMove(m.id, 1)} accessibilityLabel={T('customize.moveDown', { label })} hitSlop={4}>
                <ChevronDown size={16} strokeWidth={1.8} color={i === items.length - 1 ? colors.textFaint : colors.textSub} />
              </Pressable>
              <Text style={[styles.label, !on && styles.labelOff]} numberOfLines={1}>{label}</Text>
              <Pressable
                style={[styles.track, on && styles.trackOn]}
                onPress={() => onToggle(m.id)}
                accessibilityRole="switch"
                accessibilityState={{ checked: on }}
                accessibilityLabel={on ? T('customize.hide', { label }) : T('customize.show', { label })}
                hitSlop={6}
              >
                <View style={[styles.knob, on && styles.knobOn]} />
              </Pressable>
            </View>
          )
        })}
      </View>
    </Sheet>
  )
}

const styles = themed((c) => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hint: { flex: 1, fontSize: 12, color: c.textSub, lineHeight: 17 },
  reset: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 4 },
  resetText: { fontSize: 13, fontWeight: '600', color: c.brand },
  list: { borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, overflow: 'hidden' },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: c.divider },
  move: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 14, color: c.text },
  labelOff: { color: c.textFaint },
  track: { width: 44, height: 26, borderRadius: 13, backgroundColor: c.cardFlat, borderWidth: 1, borderColor: c.border, padding: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' },
  trackOn: { backgroundColor: c.brand, borderColor: c.brand, justifyContent: 'flex-end' },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: c.card },
  knobOn: { backgroundColor: c.onBrand },
}))
