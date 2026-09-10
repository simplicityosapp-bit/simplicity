import { Modal, View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { Pressable } from './Pressable'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'

// Bottom-sheet modal — a slide-up cream panel with a title + close, over a
// backdrop. The home quick-add flows (launcher, add-task, goal update) render
// their forms inside it. Uses RN Modal so it floats above the tab bar and isn't
// clipped by the home ScrollView.
export default function Sheet({ open, onClose, title, children }) {
  const insets = useSafeAreaInsets()
  /* Android gives a Modal its own window, and by default that window
     stops below the status bar while the app behind it draws edge-to-edge.
     The backdrop therefore dimmed everything except a bright strip along
     the top, with a hard edge across it. Both flags let the window cover
     what the app covers; the panel already pads itself by insets.bottom,
     so nothing lands under the gesture bar. */
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        {/* Fill the overlay + anchor to the bottom so the sheet's maxHeight '86%'
            resolves against the full screen height (an auto-height wrapper left a
            tall form — e.g. Add Client — unconstrained, overflowing off the top).
            box-none lets taps in the empty area above the sheet reach the backdrop.

            `behavior={undefined}` on Android is deliberate and is what Expo's
            own keyboard guide prescribes — "just having the KeyboardAvoidingView
            prevents covering the input". Do not 'fix' it to 'height' on the
            reasoning below without a device in hand:

            edge-to-edge has been on by default since SDK 53, and from Android 15
            adjustResize no longer resizes the window, which is the mechanism the
            undefined behavior relies on. If a report says the keyboard covers an
            add/edit form on Android, this line is the first suspect — but the
            preview cannot reach it (Platform.OS is 'web' there and there is no
            soft keyboard), so it needs a real check rather than a guess. Expo's
            escape hatches, in order: softwareKeyboardLayoutMode 'pan' in
            app.json, then react-native-keyboard-controller. */}
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

const styles = themed((c, t) => ({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: c.overlay },
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 18, maxHeight: '86%',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: c.text },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.cardFlat, alignItems: 'center', justifyContent: 'center' },
  body: { gap: 16, paddingBottom: 8 },
}))
