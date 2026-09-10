import { useEffect, useRef } from 'react'
import { View, Text, Image, Pressable, ScrollView, StyleSheet, Animated } from 'react-native'
import { BlurView } from './SafeBlur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Home, Users, Heart, Wallet, ClipboardList, Target, CalendarDays, Settings, FolderOpen, Activity, BarChart3, Trash2, LayoutTemplate, Plug, Sun, Moon, X, LogOut, Pencil, BookOpen, Shield } from 'lucide-react-native'

const LOGO = require('../../assets/logo.png')
import { isAdminUser } from '@simplicity/core'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { usePreferences, roleLabel } from '../lib/preferences'
import i18n from '../lib/i18n'
import { colors, space, setThemeMode, getThemeMode } from '../theme/theme'
import { themed, themedMap } from '../theme/themed'

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
  { key: 'connections', screen: 'Connections', Icon: Plug, fb: 'חיבורים' },
  { key: 'settings', screen: 'Settings', Icon: Settings, fb: 'הגדרות' },
]
// Secondary tools — labeled link rows (web "extras"): title + sub + tinted chip.
const PERSONAL = [
  { key: 'sitePages', screen: 'Pages', Icon: LayoutTemplate, title: 'nav:extras.sitePages', sub: 'nav:items.sitePagesSub', fb: 'דפים ציבוריים' },
  { key: 'insights', screen: 'Insights', Icon: Activity, title: 'nav:extras.insights', sub: 'nav:items.insightsSub', fb: 'מה איתך היום?' },
  { key: 'moon', screen: 'Moon', logo: true, title: 'nav:extras.moon', sub: 'nav:items.moonSub', fb: 'מבט על' },
  { key: 'reports', screen: 'Reports', Icon: BarChart3, title: 'nav:extras.reports', sub: 'nav:items.reportsSub', fb: 'דוחות' },
]
const TOOLS = [
  /* The manual. Web reaches it from its own menu drawer rather than from
     Settings, where it used to sit four disclosures deep — and the labels
     were already translated under nav:extras.help, waiting for a screen to
     point at. */
  { key: 'help', screen: 'Help', Icon: BookOpen, title: 'nav:extras.help', sub: 'nav:items.helpSub', fb: 'עזרה ומדריך' },
  { key: 'trash', screen: 'Trash', Icon: Trash2, tint: 'amber', title: 'nav:extras.trash', sub: 'nav:items.trashSub', fb: 'סל מיחזור' },
]

const TINT = themedMap((c) => ({
  moon: { bg: 'rgba(90,106,140,0.16)', border: 'rgba(90,106,140,0.32)', color: c.moonDeep },
  amber: { bg: 'rgba(212,165,116,0.16)', border: 'rgba(212,165,116,0.32)', color: c.amberWarn },
}))

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

// Light/dark toggle (mirrors web's drawer theme switch) — persists the choice
// and swaps the palette in place. It used to restart the app afterwards,
// because StyleSheet.create froze its colours at module load; themed() and
// themedMap() resolve on access instead, so the switch is just a repaint.
function ThemeToggle({ dark, onToggle }) {
  return (
    <Pressable style={styles.link} onPress={onToggle}>
      <View style={styles.linkIcon}>
        {dark ? <Moon size={18} strokeWidth={1.6} color={colors.moonDeep} /> : <Sun size={18} strokeWidth={1.6} color={colors.amberWarn} />}
      </View>
      <View style={styles.linkText}>
        <Text style={styles.linkTitle}>{i18n.t(dark ? 'nav:theme.toLight' : 'nav:theme.toDarkAlt', { defaultValue: dark ? 'מצב יום' : 'מצב לילה' })}</Text>
        <Text style={styles.linkSub}>{i18n.t('nav:theme.sub', { defaultValue: 'החלפת ערכת צבעים' })}</Text>
      </View>
      <View style={[styles.switch, dark && styles.switchOn]}>
        <View style={[styles.switchThumb, dark && styles.switchThumbOn]} />
      </View>
    </Pressable>
  )
}

export default function Drawer({ open, onClose, onNavigate, activeScreen }) {
  const insets = useSafeAreaInsets()
  const { session } = useAuth()
  const { prefs, update } = usePreferences()
  const isAdmin = isAdminUser(session?.user)
  // Reflect the mode actually applied this session (not prefs, which lags the
  // AsyncStorage boot cache and is empty in the mock) so the toggle flips both ways.
  const dark = getThemeMode() === 'dark'
  const toggleTheme = () => {
    const next = dark ? 'light' : 'dark'
    try { update({ design: { theme: next } }) } catch { /* best-effort */ }
    setThemeMode(next)
  }
  const email = session?.user?.email || ''
  const name = prefs.profile?.full_name || i18n.t('nav:profile.myProfile', { defaultValue: 'הפרופיל שלי' })
  const roleText = prefs.profile?.role === 'other' ? (prefs.profile?.role_other || '') : roleLabel(prefs.profile?.role, prefs.design?.gender)
  const meta = roleText || email
  const initial = (prefs.profile?.full_name || email).trim()[0]?.toUpperCase() || '?'

  /* Slide in from the right (1 = off-screen, 0 = in) + backdrop fade.

     This has to key off `open`, not off mount. `anim` is a ref, so `[anim]`
     never changes and the effect ran exactly once - at mount, when open is
     false and the early return below means there is no view yet. The animation
     therefore played against a view that did not exist, and with
     useNativeDriver the native side is left holding a value the mounted view
     never agreed to; the panel could come up already translated off-screen,
     which is a drawer that does not open. It only ever showed on a device: RN
     Web has no native driver, so the preview animated the JS value and looked
     fine.

     Closing resets it, so the second open slides like the first instead of
     appearing instantly on a value that is already 0. */
  const anim = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (!open) { anim.setValue(1); return }
    Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }).start()
  }, [anim, open])
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
        <BlurView intensity={60} tint={colors.blurTint} style={StyleSheet.absoluteFill} pointerEvents="none" />
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
            {/* Admin console — hidden for everyone who is not one. The gate
                is UX only; the edge function behind every figure on that
                screen re-checks the caller server-side. */}
            {isAdmin ? (
              <LinkRow Icon={Shield} tint="moon"
                title={i18n.t('nav:admin.console', { defaultValue: 'קונסולת ניהול' })}
                sub={i18n.t('nav:admin.consoleSub', { defaultValue: '' })}
                onPress={() => go('Admin')} />
            ) : null}
            <ThemeToggle dark={dark} onToggle={toggleTheme} />
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
const styles = themed((c, t) => ({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 100 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,37,32,0.35)' },
  panel: {
    position: 'absolute', top: 0, bottom: 0, right: 0, width: '86%', maxWidth: 380,
    borderTopLeftRadius: 24, borderBottomLeftRadius: 24, overflow: 'hidden',
    borderLeftWidth: 0.5, borderLeftColor: c.glassBorder,
    shadowColor: '#2A2520', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: -6, height: 0 }, elevation: 12,
  },
  panelVeil: { backgroundColor: c.panelBg }, // ≈ web --modal-bg over the blur
  body: { flex: 1, paddingHorizontal: space.screenPadH },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '700', color: c.text, letterSpacing: -0.4 },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: c.fillStrong, borderWidth: 0.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  sub: { fontSize: 10, fontWeight: '500', color: c.textSub, letterSpacing: 1, marginTop: 4, marginBottom: 14, textTransform: 'uppercase' },
  scroll: { paddingBottom: 40, gap: 4 },
  // profile chip
  profile: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: c.glassTint, borderRadius: 20, borderWidth: 0.5, borderColor: c.divider, paddingVertical: 11, paddingHorizontal: 12, marginBottom: 4 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700', color: c.onBrand },
  profileText: { flex: 1, gap: 2 },
  profileName: { fontSize: 14, fontWeight: '500', color: c.text },
  profileMeta: { fontSize: 11, color: c.textSub },
  // grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginTop: 6, marginBottom: 4 },
  tile: {
    flexBasis: '30%', flexGrow: 1,
    backgroundColor: c.fill, borderRadius: 14, borderWidth: 1, borderColor: c.border,
    paddingVertical: 14, alignItems: 'center', gap: 6,
  },
  tileActive: { backgroundColor: c.brand, borderColor: c.brand },
  tileLabel: { fontSize: 12, fontWeight: '500', color: c.text },
  tileLabelActive: { color: c.onBrand, fontWeight: '600' },
  // section label
  sectionLbl: { fontSize: 10, fontWeight: '500', color: c.textSub, letterSpacing: 1, textTransform: 'uppercase', marginTop: 14, marginHorizontal: 4, marginBottom: 2 },
  // link rows
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.inputBg, borderRadius: 20, borderWidth: 0.5, borderColor: c.border, paddingVertical: 11, paddingHorizontal: 14, marginTop: 2 },
  linkIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: c.glassTint, borderWidth: 0.5, borderColor: c.divider },
  linkLogo: { width: 22, height: 22 },
  linkText: { flex: 1 },
  linkTitle: { fontSize: 14, fontWeight: '500', color: c.text },
  linkSub: { fontSize: 10, color: c.textSub, marginTop: 1, letterSpacing: 0.2 },
  // theme switch
  switch: { width: 46, height: 26, borderRadius: 13, backgroundColor: c.fillStrong, padding: 3, justifyContent: 'center' },
  switchOn: { backgroundColor: 'rgba(90,106,140,0.5)' },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: c.knob },
  switchThumbOn: { alignSelf: 'flex-end' },
}))
