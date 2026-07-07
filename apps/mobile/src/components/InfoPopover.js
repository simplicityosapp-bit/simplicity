import { useState } from 'react'
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native'
import { HelpCircle } from 'lucide-react-native'
import i18n from '../lib/i18n'
import { colors, shadow } from '../theme/theme'

// Small "?" → info popover, mirroring web InfoPopover. On mobile the body shows
// in a light transparent Modal (tap outside to close) rather than a portal —
// avoids clipping by the glass cards' overflow.
export default function InfoPopover({ text, label }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Pressable
        hitSlop={10}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label || i18n.t('components:infoPopover.label', { defaultValue: 'הסבר' })}
      >
        <HelpCircle size={13} strokeWidth={1.7} color={colors.textFaint} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.body}>
            <Text style={styles.text}>{text}</Text>
          </View>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(42,37,32,0.28)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  body: { maxWidth: 320, backgroundColor: colors.card, borderRadius: 16, borderWidth: 0.5, borderColor: colors.border, paddingVertical: 14, paddingHorizontal: 16, ...shadow.card },
  text: { fontSize: 14, lineHeight: 20, color: colors.textSub },
})
