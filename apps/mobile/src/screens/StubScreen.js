import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'

// Temporary placeholder for a feature screen not built yet. Gives attention/
// widget rows a real navigation target (with a back affordance) until the real
// screen lands in a later increment. The route name is the title for now.
export default function StubScreen({ route }) {
  const nav = useNavigation()
  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <Pressable onPress={() => nav.goBack()} hitSlop={10}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{route?.name || ''}</Text>
        <View style={styles.spacer} />
      </View>
      <View style={styles.body}>
        <Text style={styles.emoji}>🚧</Text>
        <Text style={styles.soon}>בקרוב</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fbf7f2' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: 12, paddingHorizontal: 16, gap: 8 },
  back: { fontSize: 30, color: '#C97B5E', lineHeight: 30 },
  title: { fontSize: 18, fontWeight: '600', color: '#3a342e', flex: 1, textAlign: 'center' },
  spacer: { width: 30 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emoji: { fontSize: 44 },
  soon: { fontSize: 16, color: '#7c6f63' },
})
