import { useSyncExternalStore, useEffect, useRef } from 'react'
import { View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RotateCcw, X, Check } from 'lucide-react-native'
import { subscribe, getSnapshot, performUndo, dismiss } from '../lib/undo'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// <UndoToast> — the visible half of the undo system, mirroring the web
// component. Mounted once at the app shell; renders nothing while idle.
//
//   phase 'offer'  → "<label> · בטל" with a dismiss X and a countdown bar
//                    that auto-expires after ~6s.
//   phase 'undone' → brief "בוטל" confirmation.
//   phase 'note'   → brief confirmation with nothing to undo.
//
// No keyboard here — web binds Ctrl/Cmd+Z, but on a phone the "בטל" tap
// target IS the affordance, which is why the bar has to be visible long
// enough to reach. The countdown is an Animated width rather than a CSS
// animation; it is re-keyed off `seq` so a new action restarts it.
export default function UndoToast() {
  const insets = useSafeAreaInsets()
  const { phase, label, duration, seq } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const progress = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (phase === 'idle') return undefined
    progress.setValue(1)
    const anim = Animated.timing(progress, {
      toValue: 0,
      duration,
      easing: Easing.linear,
      // Width cannot run on the native thread; the bar is one cheap view.
      useNativeDriver: false,
    })
    anim.start()
    return () => anim.stop()
  }, [seq, phase, duration, progress])

  if (phase === 'idle') return null

  const offering = phase === 'offer'
  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 78 }]} pointerEvents="box-none" accessibilityLiveRegion="polite">
      <View style={styles.toast}>
        {offering ? (
          <>
            <Text style={styles.label} numberOfLines={2}>{label}</Text>
            <Pressable style={styles.action} onPress={performUndo} accessibilityRole="button">
              <RotateCcw size={13} strokeWidth={1.9} color={colors.onBtn} />
              <Text style={styles.actionText}>{i18n.t('components:undo.undo')}</Text>
            </Pressable>
            <Pressable style={styles.x} onPress={dismiss} accessibilityRole="button" accessibilityLabel={i18n.t('components:undo.dismiss')}>
              <X size={14} strokeWidth={1.8} color={colors.textSub} />
            </Pressable>
          </>
        ) : (
          <View style={styles.doneRow}>
            <Check size={14} strokeWidth={2} color={colors.positive} />
            <Text style={styles.label} numberOfLines={2}>{label}</Text>
          </View>
        )}
      </View>
      <Animated.View
        style={[styles.bar, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  // Sits above the bottom tab bar so it never covers the nav.
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'stretch' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.text,
  },
  label: { flex: 1, fontSize: 13, color: colors.card },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.btnBg },
  actionText: { fontSize: 13, fontWeight: '600', color: colors.onBtn },
  x: { padding: 4 },
  doneRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  bar: { height: 2, borderRadius: 2, backgroundColor: colors.btnBg, marginTop: -2 },
})
