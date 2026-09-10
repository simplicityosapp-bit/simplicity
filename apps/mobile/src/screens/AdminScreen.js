import { useState } from 'react'
import { View, Text, ScrollView, RefreshControl } from 'react-native'
import { Pressable } from '../components/Pressable'
import { LayoutDashboard, Users, MessageSquare, BarChart3 } from 'lucide-react-native'
import { isAdminUser } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import { useAuth } from '../lib/auth'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'
import AdminDashboard from './admin/AdminDashboard'
import AdminUsers from './admin/AdminUsers'
import AdminFeedback from './admin/AdminFeedback'
import AdminAnalytics from './admin/AdminAnalytics'
import { useBottomPad } from '../lib/bottomBar'

const T = (k, o) => i18n.t(`admin:${k}`, o)

/* ════════════════════════════════════════════════════════════════
   The admin console on a phone.
   ════════════════════════════════════════════════════════════════
   Web gives this its own world — a nav rail, its own layout, none of
   the app's chrome — reasoning that if the console breaks, no regular
   user feels it. The same reasoning holds here, but a phone has no
   room for a rail: the four screens become a tab strip and the app's
   ordinary Screen wrapper carries them.

   The gate below is UX only, exactly as on web. Every figure on every
   tab comes from the `admin` edge function, which re-verifies the
   caller server-side — someone who forced their way to this route
   would get a console full of 403s, not somebody else's data.
   ════════════════════════════════════════════════════════════════ */

const TABS = [
  { key: 'dashboard', Icon: LayoutDashboard, Body: AdminDashboard },
  { key: 'users', Icon: Users, Body: AdminUsers },
  { key: 'feedback', Icon: MessageSquare, Body: AdminFeedback },
  { key: 'analytics', Icon: BarChart3, Body: AdminAnalytics },
]

export default function AdminScreen() {
  const bottomPad = useBottomPad()
  const { session } = useAuth()
  const [tab, setTab] = useState('dashboard')
  /* Remounting the active tab IS the refresh: each one owns its own
     useAdminQuery, so a new key re-runs exactly the reads that tab
     needs and nothing else. */
  const [nonce, setNonce] = useState(0)

  const allowed = isAdminUser(session?.user)
  const active = TABS.find((x) => x.key === tab) || TABS[0]
  const Body = active.Body

  return (
    <Screen name="moon">
      <ScrollView
        contentContainerStyle={[styles.content, bottomPad]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => setNonce((n) => n + 1)} tintColor={colors.brand} />}
      >
        <ScreenHead title={T('nav.title')} tagline={allowed ? T(`${tab}.subtitle`) : undefined} />

        {!allowed ? (
          <Text style={styles.denied}>{T('state.forbidden')}</Text>
        ) : (
          <>
            <View style={styles.tabs}>
              {TABS.map(({ key, Icon }) => {
                const on = key === tab
                return (
                  <Pressable
                    key={key}
                    style={[styles.tab, on && styles.tabOn]}
                    onPress={() => setTab(key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Icon size={15} strokeWidth={1.8} color={on ? colors.onBrand : colors.textSub} />
                    <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>{T(`nav.${key}`)}</Text>
                  </Pressable>
                )
              })}
            </View>

            <Body key={`${tab}-${nonce}`} />
            <View style={styles.footSpace} />
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

const styles = themed((c, t) => ({
  /* Bottom clearance comes from `bottomPad`, like every other screen — this
     one used to reserve 24, which left most of the last panel under the bar.
     Horizontal padding is deliberately absent: the admin panels are full-bleed
     cards that pad their own contents. */
  content: {},
  tabs: { flexDirection: 'row', gap: 6, paddingBottom: 12 },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 8, borderRadius: 10, backgroundColor: c.fill,
  },
  tabOn: { backgroundColor: c.brand },
  tabText: { fontSize: 11, color: c.textSub, fontWeight: '600' },
  tabTextOn: { color: c.onBrand },
  footSpace: { height: 24 },
  denied: { ...t.caption, color: c.textFaint, textAlign: 'center', paddingVertical: 40 },
}))
