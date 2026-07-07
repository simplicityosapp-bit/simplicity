import { useEffect, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Users, ClipboardList, Home, Wallet, Menu } from 'lucide-react-native'
import i18n from '../lib/i18n'
import { useDrawer } from '../lib/drawer'
import { navigationRef } from '../navigation/AppNavigator'

// Persistent bottom tab bar (mirrors web BottomNav): a dark frosted-glass bar
// with per-tab brand-color icon chips + cream labels. Rendered ONCE at the App
// level as an overlay ABOVE the navigator (like the drawer), so it stays visible
// on EVERY screen — including the drill-in stack screens (Goals/Leads/Moon/…)
// that used to hide it. Navigation goes through navigationRef; the active chip
// tracks the current route. "תפריט" opens the drawer.
const CREAM = '#F0EBE0'
const TAB_NAMES = ['Clients', 'Tasks', 'Home', 'Finance']
const ITEMS = [
  { name: 'Clients', icon: Users, rgb: '139,168,136', key: 'clients' },   // sage
  { name: 'Tasks', icon: ClipboardList, rgb: '212,165,116', key: 'tasks' }, // amber
  { name: 'Home', icon: Home, rgb: '201,123,94', key: 'home' },            // terracotta
  { name: 'Finance', icon: Wallet, rgb: '181,99,78', key: 'finance' },     // clay
  { name: 'Menu', icon: Menu, rgb: '244,227,218', key: 'menu' },           // blush
]

export default function BottomBar() {
  const insets = useSafeAreaInsets()
  const { setOpen } = useDrawer()
  const [route, setRoute] = useState(null)

  useEffect(() => {
    const update = () => { if (navigationRef.isReady()) setRoute(navigationRef.getCurrentRoute()?.name) }
    update()
    const unsub = navigationRef.isReady() ? navigationRef.addListener('state', update) : null
    return () => { if (unsub) unsub() }
  }, [])

  // A drill-in stack screen (not one of the 4 tabs) → light up "תפריט", like web.
  const onMenuScreen = route != null && !TAB_NAMES.includes(route)

  const press = (item) => {
    if (item.name === 'Menu') { setOpen(true); return }
    if (navigationRef.isReady()) navigationRef.navigate('Main', { screen: item.name })
  }

  return (
    <View style={[styles.bar, { paddingBottom: 10 + insets.bottom }]}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={[StyleSheet.absoluteFill, styles.tint]} pointerEvents="none" />
      {ITEMS.map((item) => {
        const Icon = item.icon
        const active = item.name === 'Menu' ? onMenuScreen : route === item.name
        return (
          <Pressable key={item.key} style={styles.item} onPress={() => press(item)} accessibilityRole="button" accessibilityState={{ selected: active }}>
            <View style={[styles.chip, { backgroundColor: `rgba(${item.rgb},${active ? 0.34 : 0.14})`, borderColor: `rgba(${item.rgb},${active ? 0.6 : 0.32})` }]}>
              <Icon size={22} strokeWidth={1.5} color={`rgb(${item.rgb})`} />
            </View>
            <Text style={styles.label} numberOfLines={1}>{i18n.t(item.name === 'Menu' ? 'nav:menu' : `nav:items.${item.key}`, { defaultValue: item.key })}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', paddingTop: 10, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: 'rgba(240,235,224,0.10)', overflow: 'hidden' },
  tint: { backgroundColor: 'rgba(42,37,32,0.42)' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 2 },
  chip: { width: 44, height: 34, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, fontWeight: '500', color: CREAM },
})
