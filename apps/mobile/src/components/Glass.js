import { View, Pressable, StyleSheet } from 'react-native'
import { BlurView } from './SafeBlur'
import { colors } from '../theme/theme'

// Frosted-glass chrome matching the Card's translucency (BlurView + cream veil +
// hairline) but WITHOUT its shadow/large radius — for small chrome (pills,
// search, toggles) so the controls read as glass like the cards instead of
// opaque white. `on` fills solid terracotta for an active/selected state.
function Layers({ on, onColor }) {
  return (
    <>
      <BlurView intensity={50} tint={colors.blurTint} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: on ? onColor : colors.glassTint }]} pointerEvents="none" />
    </>
  )
}

export function Glass({ radius = 14, on = false, onColor = colors.brand, style, children }) {
  return (
    <View style={[styles.base, { borderRadius: radius, borderColor: on ? onColor : colors.glassBorder }, style]}>
      <Layers on={on} onColor={onColor} />
      {children}
    </View>
  )
}

export function GlassPressable({ radius = 999, on = false, onColor = colors.brand, style, onPress, children, ...rest }) {
  return (
    <Pressable style={[styles.base, { borderRadius: radius, borderColor: on ? onColor : colors.glassBorder }, style]} onPress={onPress} {...rest}>
      <Layers on={on} onColor={onColor} />
      {children}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden', borderWidth: 0.5 },
})

Layers.displayName = 'Layers'
