import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { homeChips, todayItems, isr } from '@simplicity/core'
import i18n from '../lib/i18n'
import { CalendarClock, Wallet, Users } from 'lucide-react-native'
import { useHomeData } from '../hooks/useHomeData'
import Screen from '../components/Screen'
import Card from '../components/Card'
import { colors, space } from '../theme/theme'
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
  const {
    clients, transactions, meetings, calendarEvents, leads, groups,
    tasks, goals, categories, sessions, members, reminders, entries, answers, questions, loading, error, refetch, addAnswer, addTask, addEntry, addTransaction, addClient, addLead, addProject, addReminder, addMeeting,
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

  return (
    <Screen name="home">
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
      >
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
        {!loading ? <QuickRow clients={clients} goals={goals} categories={categories} addTask={addTask} addEntry={addEntry} addTransaction={addTransaction} addClient={addClient} addLead={addLead} addProject={addProject} addReminder={addReminder} addMeeting={addMeeting} /> : null}

        {/* Widget order mirrors web: attention · reminders · next-tasks, chips last. */}
        {!loading ? <AttentionWidget data={attentionData} /> : null}
        {!loading ? <RemindersWidget reminders={reminders} /> : null}
        {!loading ? <NextTasksWidget tasks={tasks} /> : null}

        {!loading ? (
          <View style={styles.chips}>
            <Chip value={String(today.length)} label={i18n.t('home:widgets.chips.meetings')} Icon={CalendarClock} onPress={() => nav.navigate('Calendar')} />
            <Chip value={netStr} label={i18n.t('home:widgets.chips.net')} long={netStr.length >= 8} Icon={Wallet} onPress={() => nav.navigate('Finance')} />
            <Chip value={String(chips.activeClients)} label={i18n.t('home:widgets.chips.clients')} Icon={Users} onPress={() => nav.navigate('Clients')} />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

function Chip({ value, label, long, Icon, onPress }) {
  return (
    <Pressable style={styles.chipWrap} onPress={onPress}>
      <Card padded={false} contentStyle={styles.chipInner}>
        {Icon ? <Icon size={18} strokeWidth={1.6} color={colors.textSub} style={styles.chipIcon} /> : null}
        <Text style={[styles.chipNum, long && styles.chipNumLong]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        <Text style={styles.chipLbl}>{label}</Text>
      </Card>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.screenPadH, paddingBottom: 96, gap: 8 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fbeae7', borderRadius: 12, padding: 12, marginBottom: 8 },
  errorText: { color: colors.danger, fontSize: 13, flex: 1 },
  retry: { color: colors.danger, fontSize: 18 },
  topRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 4 },
  chips: { flexDirection: 'row', gap: 12, marginTop: 12 },
  chipWrap: { flex: 1 },
  chipInner: { paddingTop: 26, paddingBottom: 14, paddingHorizontal: 12, alignItems: 'center', gap: 4 },
  chipIcon: { position: 'absolute', top: 12, end: 12 },
  chipNum: { fontSize: 22, fontWeight: '500', color: colors.text, fontVariant: ['tabular-nums'] },
  chipNumLong: { fontSize: 18 },
  chipLbl: { fontSize: 11, fontWeight: '500', color: colors.textSub },
})
