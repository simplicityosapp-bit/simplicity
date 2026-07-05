import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Heart, Target, CalendarDays, Moon } from 'lucide-react-native'
import Screen from '../components/Screen'
import Card from '../components/Card'
import i18n from '../lib/i18n'
import { colors, space } from '../theme/theme'

// The "תפריט" tab — the screens not on the bottom bar (matches the web drawer's
// overflow). Rows push onto the root stack.
const ITEMS = [
  { key: 'leads', screen: 'Leads', Icon: Heart, fallback: 'לידים' },
  { key: 'goals', screen: 'Goals', Icon: Target, fallback: 'יעדים' },
  { key: 'calendar', screen: 'Calendar', Icon: CalendarDays, fallback: 'יומן' },
  { key: 'moon', screen: 'Moon', Icon: Moon, fallback: 'מבט על' },
]

export default function MenuScreen() {
  const nav = useNavigation()
  const insets = useSafeAreaInsets()
  return (
    <Screen name="home">
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>{i18n.t('nav:menu', { defaultValue: 'תפריט' })}</Text>
        <Card padded={false}>
          {ITEMS.map((it, i) => (
            <Pressable key={it.key} style={[styles.row, i > 0 && styles.rowBorder]} onPress={() => nav.navigate(it.screen)}>
              <it.Icon size={20} strokeWidth={1.6} color={colors.brand} />
              <Text style={styles.label}>{i18n.t(`nav:items.${it.key}`, { defaultValue: it.fallback })}</Text>
              <Text style={styles.chev}>›</Text>
            </Pressable>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.screenPadH, paddingBottom: 40, gap: 12 },
  title: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  label: { flex: 1, fontSize: 15, color: colors.text },
  chev: { color: colors.textFaint, fontSize: 20 },
})
