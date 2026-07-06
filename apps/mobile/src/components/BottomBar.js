import { View, Text, Pressable, StyleSheet } from 'react-native'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Users, ClipboardList, Home, Wallet, Menu } from 'lucide-react-native'
import i18n from '../lib/i18n'
import { useDrawer } from '../lib/drawer'

// Bottom tab bar (mirrors web BottomNav): a dark frosted-glass bar with a per-tab
// brand-color icon chip (sage / amber / terracotta / clay / blush) and cream
// labels; the active tab's chip fills stronger. "תפריט" opens the drawer.
const CREAM = '#F0EBE0'
const TABS = {
  Clients: { icon: Users, rgb: '139,168,136', key: 'clients' },   // sage
  Tasks: { icon: ClipboardList, rgb: '212,165,116', key: 'tasks' }, // amber
  Home: { icon: Home, rgb: '201,123,94', key: 'home' },            // terracotta
  Finance: { icon: Wallet, rgb: '181,99,78', key: 'finance' },     // clay
  Menu: { icon: Menu, rgb: '244,227,218', key: 'menu' },           // blush
}

export default function BottomBar({ state, navigation }) {
  const insets = useSafeAreaInsets()
  const { setOpen } = useDrawer()
  return (
    <View style={[styles.bar, { paddingBottom: 10 + insets.bottom }]}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={[StyleSheet.absoluteFill, styles.tint]} pointerEvents="none" />
      {state.routes.map((route, i) => {
        const cfg = TABS[route.name]
        if (!cfg) return null
        const Icon = cfg.icon
        const isMenu = route.name === 'Menu'
        const active = !isMenu && state.index === i
        const onPress = () => {
          if (isMenu) { setOpen(true); return }
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
          if (!event.defaultPrevented) navigation.navigate(route.name)
        }
        return (
          <Pressable key={route.key} style={styles.item} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}>
            <View style={[styles.chip, { backgroundColor: `rgba(${cfg.rgb},${active ? 0.34 : 0.14})`, borderColor: `rgba(${cfg.rgb},${active ? 0.6 : 0.32})` }]}>
              <Icon size={22} strokeWidth={1.5} color={`rgb(${cfg.rgb})`} />
            </View>
            <Text style={styles.label} numberOfLines={1}>{i18n.t(isMenu ? 'nav:menu' : `nav:items.${cfg.key}`, { defaultValue: cfg.key })}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', paddingTop: 10, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: 'rgba(240,235,224,0.10)', overflow: 'hidden' },
  tint: { backgroundColor: 'rgba(42,37,32,0.42)' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 2 },
  chip: { width: 44, height: 34, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, fontWeight: '500', color: CREAM },
})
