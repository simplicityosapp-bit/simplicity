import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Home, Users, Heart, Wallet, ClipboardList, Target, CalendarDays, Moon, Sparkles, Settings, Trash2, FolderOpen, BarChart3, X, LogOut, Pencil } from 'lucide-react-native'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { usePreferences } from '../lib/preferences'
import i18n from '../lib/i18n'
import { colors, space } from '../theme/theme'

// The "עוד" drawer — a right-anchored overlay sheet (RTL), matching web's
// MenuDrawer: close + a grid of screen tiles + logout. Opened from the bottom
// bar's תפריט button (not a tab screen).
const TILES = [
  { key: 'home', screen: 'Home', Icon: Home, fallback: 'בית' },
  { key: 'clients', screen: 'Clients', Icon: Users, fallback: 'לקוחות' },
  { key: 'projects', screen: 'Projects', Icon: FolderOpen, fallback: 'פרויקטים' },
  { key: 'leads', screen: 'Leads', Icon: Heart, fallback: 'לידים' },
  { key: 'finance', screen: 'Finance', Icon: Wallet, fallback: 'כסף' },
  { key: 'tasks', screen: 'Tasks', Icon: ClipboardList, fallback: 'משימות' },
  { key: 'goals', screen: 'Goals', Icon: Target, fallback: 'יעדים' },
  { key: 'calendar', screen: 'Calendar', Icon: CalendarDays, fallback: 'יומן' },
  { key: 'moon', screen: 'Moon', Icon: Moon, fallback: 'מבט על' },
  { key: 'reports', screen: 'Reports', Icon: BarChart3, fallback: 'דוחות' },
  { key: 'questions', screen: 'Questions', Icon: Sparkles, fallback: 'שאלות' },
  { key: 'trash', screen: 'Trash', Icon: Trash2, fallback: 'סל מיחזור' },
  { key: 'settings', screen: 'Settings', Icon: Settings, fallback: 'הגדרות' },
]

export default function Drawer({ open, onClose, onNavigate, activeScreen }) {
  const insets = useSafeAreaInsets()
  const { session } = useAuth()
  const { prefs } = usePreferences()
  const email = session?.user?.email || ''
  const name = prefs.full_name || i18n.t('nav:profile.myProfile', { defaultValue: 'הפרופיל שלי' })
  const roleText = prefs.role === 'other' ? (prefs.role_other || '') : (prefs.role ? i18n.t(`settings:profile.roles.${prefs.role}`, { defaultValue: '' }) : '')
  const meta = roleText || email
  const initial = (prefs.full_name || email).trim()[0]?.toUpperCase() || '?'
  if (!open) return null
  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.panel, { paddingTop: insets.top + 12 }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{i18n.t('nav:more', { defaultValue: 'עוד' })}</Text>
          <Pressable style={styles.close} onPress={onClose} hitSlop={8}>
            <X size={16} strokeWidth={1.6} color={colors.textSub} />
          </Pressable>
        </View>
        <Text style={styles.sub}>{i18n.t('nav:drawerSubtitle', { defaultValue: 'תפריט · העדפות וכלים אישיים' })}</Text>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable style={styles.profile} onPress={() => { onClose(); onNavigate('Settings') }}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{initial}</Text></View>
            <View style={styles.profileText}>
              <Text style={styles.profileName} numberOfLines={1}>{name}</Text>
              <Text style={styles.profileMeta} numberOfLines={1}>{meta}</Text>
            </View>
            <Pencil size={16} strokeWidth={1.5} color={colors.textFaint} />
          </Pressable>

          <View style={styles.grid}>
            {TILES.map((it) => {
              const active = activeScreen === it.screen
              return (
                <Pressable
                  key={it.key}
                  style={[styles.tile, active && styles.tileActive]}
                  onPress={() => { onClose(); onNavigate(it.screen) }}
                >
                  <it.Icon size={22} strokeWidth={1.6} color={active ? colors.onBrand : colors.brand} />
                  <Text style={[styles.tileLabel, active && styles.tileLabelActive]}>
                    {i18n.t(`nav:items.${it.key}`, { defaultValue: it.fallback })}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <Pressable style={styles.logout} onPress={() => { onClose(); supabase.auth.signOut() }}>
            <LogOut size={18} strokeWidth={1.6} color={colors.danger} />
            <Text style={styles.logoutText}>{i18n.t('nav:signOut', { defaultValue: 'התנתקות' })}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  )
}

const GAP = 10
const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 100 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,37,32,0.35)' },
  panel: {
    position: 'absolute', top: 0, bottom: 0, right: 0, width: '86%', maxWidth: 380,
    backgroundColor: colors.bg, paddingHorizontal: space.screenPadH,
    borderTopLeftRadius: 24, borderBottomLeftRadius: 24,
    shadowColor: '#2A2520', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: -6, height: 0 }, elevation: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.cardFlat, alignItems: 'center', justifyContent: 'center' },
  sub: { fontSize: 12, color: colors.textFaint, marginTop: 2, marginBottom: 16 },
  scroll: { paddingBottom: 40, gap: 16 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, paddingHorizontal: 14 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '700', color: colors.brand },
  profileText: { flex: 1, gap: 2 },
  profileName: { fontSize: 15, fontWeight: '600', color: colors.text },
  profileMeta: { fontSize: 12, color: colors.textFaint },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: {
    width: `${(100 - 0) / 3}%`, flexGrow: 1, flexBasis: '30%',
    backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    paddingVertical: 18, alignItems: 'center', gap: 8,
  },
  tileActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tileLabel: { fontSize: 13, color: colors.text },
  tileLabelActive: { color: colors.onBrand, fontWeight: '600' },
  logout: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card,
    borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingVertical: 15, paddingHorizontal: 16,
  },
  logoutText: { fontSize: 15, color: colors.text },
})
