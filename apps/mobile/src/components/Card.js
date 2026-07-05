import { View, StyleSheet } from 'react-native'
import { BlurView } from 'expo-blur'
import { colors, radius, shadow } from '../theme/theme'

// Cream glass card — BlurView + a cream veil (per web --mg-card-* : cream over
// blur, white hairline, radius 20, soft shadow). Shadow lives on an OUTER view
// so it isn't clipped by the inner overflow:hidden that rounds the blur.
export default function Card({ style, contentStyle, padded = true, children }) {
  return (
    <View style={[styles.shadow, style]}>
      <View style={styles.clip}>
        <BlurView intensity={50} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.tint]} />
        <View style={[padded && styles.padded, contentStyle]}>{children}</View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  shadow: { borderRadius: radius.card, ...shadow.card, backgroundColor: 'transparent' },
  clip: { borderRadius: radius.card, overflow: 'hidden', borderWidth: 1, borderColor: colors.glassBorder },
  tint: { backgroundColor: colors.glassTint },
  padded: { paddingVertical: 20, paddingHorizontal: 22 }, // toward web --mg-card-pad 24×28
})
