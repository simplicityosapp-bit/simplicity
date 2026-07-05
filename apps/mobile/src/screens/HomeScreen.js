import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { homeChips, todayItems, isr } from '@simplicity/core'
import i18n from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useHomeData } from '../hooks/useHomeData'
import Screen from '../components/Screen'
import Card from '../components/Card'
import { colors, type, space } from '../theme/theme'
import AttentionWidget from './home/AttentionWidget'
import NextTasksWidget from './home/NextTasksWidget'
import RemindersWidget from './home/RemindersWidget'
import MoonWidget from './home/MoonWidget'
import QuoteWidget from './home/QuoteWidget'
import InsightsWidget from './home/InsightsWidget'
import QuickRow from './home/QuickRow'

// Home — greeting + net/clients/today chips (shared core homeChips) + the
// widget stack, over the per-screen background photo (Warm Precision theme).
export default function HomeScreen() {
  const nav = useNavigation()
  const insets = useSafeAreaInsets()
  const { session } = useAuth()
  const {
    clients, transactions, meetings, calendarEvents, leads, groups,
    tasks, goals, categories, sessions, members, reminders, entries, answers, questions, loading, error, refetch, addAnswer, addTask, addEntry,
  } = useHomeData()

  const moonData = useMemo(
    () => ({ goals, categories, entries, transactions, sessions, clients, leads, answers, members, groups }),
    [goals, categories, entries, transactions, sessions, clients, leads, answers, members, groups],
  )
  const attentionData = useMemo(
    () => ({ transactions, scheduled_meetings: meetings, clients, tasks, goals, categories, sessions, leads, members, groups }),
    [transactions, meetings, clients, tasks, goals, categories, sessions, leads, members, groups],
  )
  const chips = useMemo(() => homeChips(new Date(), { clients, transactions }), [clients, transactions])
  const today = useMemo(
    () => todayItems(new Date(), { meetings, calendarEvents, leads, clients, groups }),
    [meetings, calendarEvents, leads, clients, groups],
  )
  const netStr = isr(chips.net)
  const email = session?.user?.email || ''

  return (
    <Screen name="home">
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
      >
        <View style={styles.header}>
          <Text style={styles.brand}>Simplicity</Text>
          <Pressable onPress={() => supabase.auth.signOut()} hitSlop={8}>
            <Text style={styles.logout}>{i18n.t('nav:logout')}</Text>
          </Pressable>
        </View>

        {email ? <Text style={styles.email}>{email}</Text> : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={refetch}><Text style={styles.retry}>↻</Text></Pressable>
          </View>
        ) : null}

        {!loading ? (
          <View style={styles.topRow}>
            <QuoteWidget />
            <MoonWidget data={moonData} />
          </View>
        ) : null}

        {!loading ? <InsightsWidget questions={questions} answers={answers} addAnswer={addAnswer} /> : null}
        {!loading ? <QuickRow goals={goals} categories={categories} addTask={addTask} addEntry={addEntry} /> : null}

        <View style={styles.chips}>
          <Chip value={loading ? '··' : String(today.length)} label={i18n.t('home:widgets.chips.meetings')} onPress={() => nav.navigate('Calendar')} />
          <Chip value={loading ? '··' : netStr} label={i18n.t('home:widgets.chips.net')} long={netStr.length >= 8} onPress={() => nav.navigate('Finance')} />
          <Chip value={loading ? '··' : String(chips.activeClients)} label={i18n.t('home:widgets.chips.clients')} onPress={() => nav.navigate('Clients')} />
        </View>

        {!loading ? <AttentionWidget data={attentionData} /> : null}
        {!loading ? <NextTasksWidget tasks={tasks} /> : null}
        {!loading ? <RemindersWidget reminders={reminders} /> : null}
      </ScrollView>
    </Screen>
  )
}

function Chip({ value, label, long, onPress }) {
  return (
    <Pressable style={styles.chipWrap} onPress={onPress}>
      <Card padded={false} contentStyle={styles.chipInner}>
        <Text style={[styles.chipNum, long && styles.chipNumLong]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        <Text style={styles.chipLbl}>{label}</Text>
      </Card>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.screenPadH, paddingBottom: 40, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: 16, letterSpacing: 1, color: colors.brand, fontWeight: '600' },
  logout: { color: colors.textSub, fontSize: 14 },
  email: { color: colors.textFaint, fontSize: 13, marginBottom: 12 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fbeae7', borderRadius: 12, padding: 12, marginBottom: 8 },
  errorText: { color: colors.danger, fontSize: 13, flex: 1 },
  retry: { color: colors.danger, fontSize: 18 },
  topRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 4 },
  chips: { flexDirection: 'row', gap: 12 },
  chipWrap: { flex: 1 },
  chipInner: { paddingVertical: 22, paddingHorizontal: 12, alignItems: 'center', gap: 6 },
  chipNum: { ...type.displayL, color: colors.text },
  chipNumLong: { fontSize: 20 },
  chipLbl: { fontSize: 14, color: colors.textSub },
})
