import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { ChevronLeft } from 'lucide-react-native'
import { colors } from '../theme/theme'

// Shared screen header — centered title with an optional back chevron, over the
// Screen photo. Back shows only when the stack can pop (tab roots have no back).
export default function ScreenHeader({ title }) {
  const nav = useNavigation()
  return (
    <View style={styles.bar}>
      {nav.canGoBack() ? (
        <Pressable onPress={() => nav.goBack()} hitSlop={10}>
          <ChevronLeft size={26} strokeWidth={1.8} color={colors.brand} />
        </Pressable>
      ) : (
        <View style={styles.spacer} />
      )}
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <View style={styles.spacer} />
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: 12, paddingHorizontal: 16, gap: 8 },
  title: { fontSize: 18, fontWeight: '600', color: colors.text, flex: 1, textAlign: 'center' },
  spacer: { width: 30 },
})
