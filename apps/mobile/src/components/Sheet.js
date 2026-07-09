import { Modal, View, Text, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'
import { colors } from '../theme/theme'

// Bottom-sheet modal — a slide-up cream panel with a title + close, over a
// backdrop. The home quick-add flows (launcher, add-task, goal update) render
// their forms inside it. Uses RN Modal so it floats above the tab bar and isn't
// clipped by the home ScrollView.
export default function Sheet({ open, onClose, title, children }) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        {/* Fill the overlay + anchor to the bottom so the sheet's maxHeight '86%'
            resolves against the full screen height (an auto-height wrapper left a
            tall form — e.g. Add Client — unconstrained, overflowing off the top).
            box-none lets taps in the empty area above the sheet reach the backdrop. */}
        <KeyboardAvoidingView style={styles.kav} pointerEvents="box-none" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.head}>
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
              <Pressable style={styles.close} onPress={onClose} hitSlop={8}>
                <X size={16} strokeWidth={1.8} color={colors.textSub} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 18, maxHeight: '86%',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: colors.text },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.cardFlat, alignItems: 'center', justifyContent: 'center' },
  body: { gap: 16, paddingBottom: 8 },
})
