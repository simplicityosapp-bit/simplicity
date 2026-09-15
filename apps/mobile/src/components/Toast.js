import { useSyncExternalStore } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check, CircleAlert } from 'lucide-react-native'
import { Text } from './Text'
import { Pressable } from './Pressable'
import { subscribe, getSnapshot, clearToast } from '../lib/toast'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'

/* <Toast> — the visible half of lib/toast, mirroring web's. Mounted once at
   the app shell beside <UndoToast>; renders nothing while idle; a tap
   dismisses it. It sits higher than the undo bar (web does the same, 132px
   against the undo bar's lower slot) so a confirmation and an undo offer
   that land together are both readable instead of stacked on each other. */
export default function Toast() {
  const insets = useSafeAreaInsets()
  const { message, type, seq } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  if (!message) return null
  const isError = type === 'error'
  return (
    <View key={seq} style={[styles.wrap, { bottom: insets.bottom + 132 }]} pointerEvents="box-none">
      <Pressable
        style={[styles.toast, isError && styles.error]}
        onPress={clearToast}
        android_ripple={null}
        accessibilityRole={isError ? 'alert' : 'text'}
        accessibilityLiveRegion={isError ? 'assertive' : 'polite'}
      >
        {isError
          ? <CircleAlert size={15} strokeWidth={2} color={colors.card} />
          : <Check size={15} strokeWidth={2.2} color={colors.positive} />}
        <Text style={styles.label} numberOfLines={3}>{message}</Text>
      </Pressable>
    </View>
  )
}

const styles = themed((c) => ({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%',
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.text,
  },
  error: { backgroundColor: c.danger },
  label: { flexShrink: 1, fontSize: 13, color: c.card },
}))
