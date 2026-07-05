import { View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { backgrounds, colors } from '../theme/theme'

// Screen frame: a per-screen background photo (day set) under a soft warm scrim,
// so content (glass cards) reads over it. Falls back to the bone base if no
// photo is mapped for `name`.
export default function Screen({ name, children }) {
  const bg = backgrounds[name]
  return (
    <View style={styles.root}>
      {bg ? (
        <Image source={bg} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={200} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, styles.scrim]} />
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scrim: { backgroundColor: colors.scrim },
})
