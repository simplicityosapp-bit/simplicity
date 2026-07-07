import { useEffect, useRef } from 'react'
import { View, Text, Image, Pressable, ScrollView, StyleSheet, Animated } from 'react-native'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Home, Users, Heart, Wallet, ClipboardList, Target, CalendarDays, Settings, FolderOpen, Activity, BarChart3, Trash2, X, LogOut, Pencil } from 'lucide-react-native'

const LOGO = require('../../assets/logo.png')
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { usePreferences } from '../lib/preferences'
import i18n from '../lib/i18n'
import { colors, space } from '../theme/theme'

// The "עוד" drawer — a right-anchored frosted-glass sheet mirroring web's
// MenuDrawer: a profile chip, a 3-col glass GRID of the primary screens, then
// labeled SECTIONS ("אישי" / tools) of link rows with a sub-text + tinted icon
// chip. Slides in over every screen (rendered App-level above the navigator).

// Primary screens — 3-col grid (web DRAWER_NAV order, minus Connections which
// has no mobile screen).
const GRID = [
  { key: 'home', screen: 'Home', Icon: Home, fb: 'בית' },
  { key: 'clients', screen: 'Clients', Icon: Users, fb: 'לקוחות' },
  { key: 'leads', screen: 'Leads', Icon: Heart, fb: 'לידים' },
  { key: 'finance', screen: 'Finance', Icon: Wallet, fb: 'כסף' },
  { key: 'projects', screen: 'Projects', Icon: FolderOpen, fb: 'פרויקטים' },
  { key: 'tasks', screen: 'Tasks', Icon: ClipboardList, fb: 'משימות' },
  { key: 'goals', screen: 'Goals', Icon: Target, fb: 'יעדים' },
  { key: 'calendar', screen: 'Calendar', Icon: CalendarDays, fb: 'יומן' },
  { key: 'settings', screen: 'Settings', Icon: Settings, fb: 'הגדרות' },
]
// Secondary tools — labeled link rows (web "extras"): title + sub + tinted chip.
const PERSONAL = [
  { key: 'insights', screen: 'Insights', Icon: Activity, title: 'nav:extras.insights', sub: 'nav:items.insightsSub', fb: 'מה איתך היום?' },
  { key: 'moon', screen: 'Moon', logo: true, title: 'nav:extras.moon', sub: 'nav:items.moonSub', fb: 'מבט על' },
  { key: 'reports', screen: 'Reports', Icon: BarChart3, title: 'nav:extras.reports', sub: 'nav:items.reportsSub', fb: 'דוחות' },
]
const TOOLS = [
  { key: 'trash', screen: 'Trash', Icon: Trash2, tint: 'amber', title: 'nav:extras.trash', sub: 'nav:items.trashSub', fb: 'סל מיחזור' },
]

const TINT = {
  moon: { bg: 'rgba(90,106,140,0.16)', border: 'rgba(90,106,140,0.32)', color: colors.moonDeep },
  amber: { bg: 'rgba(212,165,116,0.16)', border: 'rgba(212,165,116,0.32)', color: colors.amberWarn },
}

function LinkRow({ Icon, logo, tint, title, sub, danger, onPress }) {
  const t = tint ? TINT[tint] : null
  return (
    <Pressable style={styles.link} onPress={onPress}>
      <View style={[styles.linkIcon, t && { backgroundColor: t.bg, borderColor: t.border }]}>
        {logo ? <Image source={LOGO} style={styles.linkLogo} resizeMode="contain" /> : <Icon size={18} strokeWidth={1.6} color={danger ? colors.danger : t ? t.color : colors.textSub} />}
      </View>
      <View style={styles.linkText}>
        <Text style={[styles.linkTitle, danger && { color: colors.danger }]} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={styles.linkSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
    </Pressable>
  )
}

export default function Drawer({ open, onClose, onNavigate, activeScreen }) {
  const insets = useSafeAreaInsets()
  const { session } = useAuth()
  const { prefs } = usePreferences()
  const email = session?.user?.email || ''
  const name = prefs.full_name || i18n.t('nav:profile.myProfile', { defaultValue: 'הפרופיל שלי' })
  const roleText = prefs.role === 'other' ? (prefs.role_other || '') : (prefs.role ? i18n.t(`settings:profile.roles.${prefs.role}`, { defaultValue: '' }) : '')
  const meta = roleText || email
  const initial = (prefs.full_name || email).trim()[0]?.toUpperCase() || '?'

  // Slide in from the right (1 = off-screen, 0 = in) + backdrop fade.
  const anim = useRef(new Animated.Value(1)).current
  useEffect(() => {
    Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }).start()
  }, [anim])
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 400] })
  const backdropOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })

  const go = (screen) => { onClose(); onNavigate(screen) }
  if (!open) return null
  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[styles.panel, { paddingTop: insets.top + 12, transform: [{ translateX }] }]}>
        <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={[StyleSheet.absoluteFill, styles.panelVeil]} pointerEvents="none" />

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{i18n.t('nav:more', { defaultValue: 'עוד' })}</Text>
            <Pressable style={styles.close} onPress={onClose} hitSlop={8}>
              <X size={16} strokeWidth={1.6} color={colors.textSub} />
            </Pressable>
          </View>
          <Text style={styles.sub}>{i18n.t('nav:drawerSubtitle', { defaultValue: 'תפריט · העדפות וכלים אישיים' })}</Text>

          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Pressable style={styles.profile} onPress={() => go('Settings')}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{initial}</Text></View>
              <View style={styles.profileText}>
                <Text style={styles.profileName} numberOfLines={1}>{name}</Text>
                <Text style={styles.profileMeta} numberOfLines={1}>{meta}</Text>
              </View>
              <Pencil size={16} strokeWidth={1.5} color={colors.textFaint} />
            </Pressable>

            <View style={styles.grid}>
              {GRID.map((it) => {
                const active = activeScreen === it.screen
                return (
                  <Pressable key={it.key} style={[styles.tile, active && styles.tileActive]} onPress={() => go(it.screen)}>
                    <it.Icon size={20} strokeWidth={1.6} color={active ? colors.onBrand : colors.brand} />
                    <Text style={[styles.tileLabel, active && styles.tileLabelActive]}>{i18n.t(`nav:items.${it.key}`, { defaultValue: it.fb })}</Text>
                  </Pressable>
                )
              })}
            </View>

            <Text style={styles.sectionLbl}>{i18n.t('nav:sections.personal', { defaultValue: 'אישי' })}</Text>
            {PERSONAL.map((it) => (
              <LinkRow key={it.key} Icon={it.Icon} logo={it.logo} tint={it.tint}
                title={i18n.t(it.title, { defaultValue: it.fb })}
                sub={it.sub ? i18n.t(it.sub, { defaultValue: '' }) : null}
                onPress={() => go(it.screen)} />
            ))}

            <Text style={styles.sectionLbl}>{i18n.t('nav:sections.settings', { defaultValue: 'הגדרות' })}</Text>
            {TOOLS.map((it) => (
              <LinkRow key={it.key} Icon={it.Icon} tint={it.tint}
                title={i18n.t(it.title, { defaultValue: it.fb })}
                sub={it.sub ? i18n.t(it.sub, { defaultValue: '' }) : null}
                onPress={() => go(it.screen)} />
            ))}
            <LinkRow Icon={LogOut} tint="amber" danger
              title={i18n.t('nav:signOut', { defaultValue: 'התנתקות' })}
              sub={email}
              onPress={() => { onClose(); supabase.auth.signOut() }} />
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  )
}

const GAP = 8
const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 100 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,37,32,0.35)' },
  panel: {
    position: 'absolute', top: 0, bottom: 0, right: 0, width: '86%', maxWidth: 380,
    borderTopLeftRadius: 24, borderBottomLeftRadius: 24, overflow: 'hidden',
    borderLeftWidth: 0.5, borderLeftColor: colors.glassBorder,
    shadowColor: '#2A2520', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: -6, height: 0 }, elevation: 12,
  },
  panelVeil: { backgroundColor: 'rgba(255,252,247,0.74)' }, // ≈ web --modal-bg over the blur
  body: { flex: 1, paddingHorizontal: space.screenPadH },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, letterSpacing: -0.4 },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.5)', borderWidth: 0.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  sub: { fontSize: 10, fontWeight: '500', color: colors.textSub, letterSpacing: 1, marginTop: 4, marginBottom: 14, textTransform: 'uppercase' },
  scroll: { paddingBottom: 40, gap: 4 },
  // profile chip
  profile: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.glassTint, borderRadius: 20, borderWidth: 0.5, borderColor: colors.divider, paddingVertical: 11, paddingHorizontal: 12, marginBottom: 4 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700', color: colors.onBrand },
  profileText: { flex: 1, gap: 2 },
  profileName: { fontSize: 14, fontWeight: '500', color: colors.text },
  profileMeta: { fontSize: 11, color: colors.textSub },
  // grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginTop: 6, marginBottom: 4 },
  tile: {
    flexBasis: '30%', flexGrow: 1,
    backgroundColor: 'rgba(255,252,247,0.5)', borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    paddingVertical: 14, alignItems: 'center', gap: 6,
  },
  tileActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tileLabel: { fontSize: 12, fontWeight: '500', color: colors.text },
  tileLabelActive: { color: colors.onBrand, fontWeight: '600' },
  // section label
  sectionLbl: { fontSize: 10, fontWeight: '500', color: colors.textSub, letterSpacing: 1, textTransform: 'uppercase', marginTop: 14, marginHorizontal: 4, marginBottom: 2 },
  // link rows
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 20, borderWidth: 0.5, borderColor: colors.border, paddingVertical: 11, paddingHorizontal: 14, marginTop: 2 },
  linkIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.glassTint, borderWidth: 0.5, borderColor: colors.divider },
  linkLogo: { width: 22, height: 22 },
  linkText: { flex: 1 },
  linkTitle: { fontSize: 14, fontWeight: '500', color: colors.text },
  linkSub: { fontSize: 10, color: colors.textSub, marginTop: 1, letterSpacing: 0.2 },
})
