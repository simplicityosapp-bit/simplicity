import { View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { backgrounds, colors } from '../theme/theme'
import { usePreferences } from '../lib/preferences'

// Screen frame with a background that honours the user's "רקע" preference
// (prefs.design.background): 'nature' = the per-screen photo (default), 'simple'
// = one calm photo everywhere, 'empty' = flat soft-cream (no photo). A soft warm
// scrim sits over any photo so glass cards stay readable.
export default function Screen({ name, children }) {
  const { prefs } = usePreferences()
  const mode = prefs?.design?.background || 'nature'
  const bg = mode === 'empty' ? null : (mode === 'simple' ? backgrounds.home : backgrounds[name])
  return (
    <View style={styles.root}>
      {bg ? (
        <Image source={bg} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={200} />
      ) : null}
      {bg ? <View style={[StyleSheet.absoluteFill, styles.scrim]} /> : null}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scrim: { backgroundColor: colors.scrim },
})
