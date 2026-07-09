import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { homeChips, todayItems, getTileFilters, moonGetData, isr } from '@simplicity/core'
import i18n from '../lib/i18n'
import { CalendarClock, Wallet, Users } from 'lucide-react-native'
import { useHomeData } from '../hooks/useHomeData'
import { useFormOptions } from '../lib/formOptions'
import { usePreferences } from '../lib/preferences'
import Screen from '../components/Screen'
import Card from '../components/Card'
import InfoPopover from '../components/InfoPopover'
import TileDrillModal from '../modals/TileDrillModal'
import { colors, space } from '../theme/theme'
import AttentionWidget from './home/AttentionWidget'
import NextTasksWidget from './home/NextTasksWidget'
import RemindersWidget from './home/RemindersWidget'
import MoonWidget, { MoonExpansion } from './home/MoonWidget'
import QuoteWidget from './home/QuoteWidget'
import InsightsWidget from './home/InsightsWidget'
import QuickRow from './home/QuickRow'

// Home — greeting + net/clients/today chips (shared core homeChips) + the
// widget stack, over the per-screen background photo (Warm Precision theme).
// Default widget order = web WIDGET_REGISTRY; prefs.widgets.list overrides it.
const DEFAULT_WIDGET_ORDER = ['quote', 'moon', 'insights', 'quick-row', 'attention', 'reminders', 'next-tasks', 'chips']

export default function HomeScreen() {
  const nav = useNavigation()
  const insets = useSafeAreaInsets()
  const {
    clients, transactions, meetings, calendarEvents, leads, groups,
    tasks, goals, categories, sessions, members, reminders, entries, answers, questions, loading, error, refetch, addAnswer, addTask, addEntry, addTransaction, addClient, addLead, addProject, addReminder, addMeeting, setMeetingStatus, confirmMeeting, toggleTask, completeReminder, setTransactionStatus, deleteTransaction,
  } = useHomeData()
  const { prefs, update: updatePrefs } = usePreferences()
  const { projects, categories: financeCategories } = useFormOptions()
  const [openTile, setOpenTile] = useState(null)
  const [moonExpanded, setMoonExpanded] = useState(false)
  const filters = useMemo(() => getTileFilters(prefs), [prefs])
  const gender = prefs.design?.gender

  const moonData = useMemo(
    () => ({ goals, categories, entries, transactions, sessions, clients, leads, answers, members, groups }),
    [goals, categories, entries, transactions, sessions, clients, leads, answers, members, groups],
  )
  const moon = useMemo(() => moonGetData(new Date(), moonData), [moonData])
  const attentionData = useMemo(
    () => ({ transactions, scheduled_meetings: meetings, clients, tasks, goals, categories, sessions, leads, members, groups }),
    [transactions, meetings, clients, tasks, goals, categories, sessions, leads, members, groups],
  )
  const chips = useMemo(() => homeChips(new Date(), { clients, tasks, transactions }, filters), [clients, tasks, transactions, filters])
  const today = useMemo(
    () => todayItems(new Date(), { meetings, calendarEvents, leads, clients, groups }, filters.today),
    [meetings, calendarEvents, leads, clients, groups, filters.today],
  )
  const netStr = isr(chips.net)
  const netLbl = filters.net?.type === 'income'
    ? i18n.t('home:widgets.chips.income', { defaultValue: 'הכנסות' })
    : filters.net?.type === 'expense'
      ? i18n.t('home:widgets.chips.expense', { defaultValue: 'הוצאות' })
      : i18n.t('home:widgets.chips.net')

  // Honor the user's home-widget config (enable/disable + order), mirroring web.
  // Falls back to the registry default order when nothing is saved.
  const list = (prefs?.widgets?.list && prefs.widgets.list.length) ? prefs.widgets.list : DEFAULT_WIDGET_ORDER.map((id) => ({ id, enabled: true }))
  const enabledIds = list.filter((w) => w.enabled !== false).map((w) => w.id)
  const enabledSet = new Set(enabledIds)
  const quoteOn = enabledSet.has('quote')
  const moonOn = enabledSet.has('moon')
  const restOrder = enabledIds.filter((id) => id !== 'quote' && id !== 'moon')

  const renderWidget = (id) => {
    switch (id) {
      case 'insights': return <InsightsWidget key="insights" questions={questions} answers={answers} addAnswer={addAnswer} />
      case 'quick-row': return <QuickRow key="quick-row" clients={clients} goals={goals} categories={categories} addTask={addTask} addEntry={addEntry} addTransaction={addTransaction} addClient={addClient} addLead={addLead} addProject={addProject} addReminder={addReminder} addMeeting={addMeeting} />
      case 'attention': return (
        <AttentionWidget key="attention" data={attentionData} projects={projects} financeCategories={financeCategories}
          onApproveTx={(id2) => setTransactionStatus(id2, 'confirmed')} onSkipTx={(id2) => setTransactionStatus(id2, 'skipped')} onDeleteTx={deleteTransaction} />
      )
      case 'reminders': return <RemindersWidget key="reminders" reminders={reminders} onComplete={completeReminder} />
      case 'next-tasks': return <NextTasksWidget key="next-tasks" tasks={tasks} onToggle={toggleTask} />
      case 'chips': return (
        <View key="chips" style={styles.chips}>
          <Chip value={String(today.length)} label={i18n.t('home:widgets.chips.meetings')} Icon={CalendarClock} onPress={() => setOpenTile('today')}
            info={<InfoPopover label={i18n.t('home:widgets.chips.meetingsInfoLabel')} text={i18n.t('home:widgets.chips.meetingsInfoText_pre') + i18n.t('home:widgets.chips.meetingsInfoText_post')} />} />
          <Chip value={netStr} label={netLbl} long={netStr.length >= 8} Icon={Wallet} onPress={() => setOpenTile('net')}
            info={<InfoPopover label={i18n.t('home:widgets.chips.netInfoLabel')} text={i18n.t('home:widgets.chips.netInfoText_pre') + i18n.t('home:widgets.chips.netInfoText_post')} />} />
          <Chip value={String(chips.activeClients)} label={i18n.t('home:widgets.chips.clients')} Icon={Users} onPress={() => setOpenTile('clients')}
            info={<InfoPopover label={i18n.t('home:widgets.chips.clientsInfoLabel')} text={i18n.t('home:widgets.chips.clientsInfoText_pre') + i18n.t('home:widgets.chips.clientsInfoText_post')} />} />
        </View>
      )
      default: return null
    }
  }

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

        {!loading && (quoteOn || moonOn) ? (
          <View style={styles.topRow}>
            {quoteOn ? <QuoteWidget /> : null}
            {moonOn ? <MoonWidget overall={moon.overall} expanded={moonExpanded} onToggle={() => setMoonExpanded((v) => !v)} /> : null}
          </View>
        ) : null}
        {!loading && moonOn && moonExpanded && moon.overall ? (
          <MoonExpansion scored={moon.scored} conf={moon.overall.confidence} gender={gender} onFull={() => nav.navigate('Moon')} />
        ) : null}

        {/* Widget order + enable/disable follow the user's prefs.widgets (web parity). */}
        {!loading ? restOrder.map((id) => renderWidget(id)) : null}
      </ScrollView>

      <TileDrillModal
        open={!!openTile}
        tile={openTile}
        onClose={() => setOpenTile(null)}
        prefs={prefs}
        updatePrefs={updatePrefs}
        filters={filters[openTile] || {}}
        clients={clients}
        groups={groups}
        projects={projects}
        categories={financeCategories}
        transactions={transactions}
        netSummary={chips}
        meetings={meetings}
        calendarEvents={calendarEvents}
        leads={leads}
        onConfirm={(it) => (it.meeting ? confirmMeeting(it.meeting) : setMeetingStatus(it.meeting?.id, 'confirmed'))}
      />
    </Screen>
  )
}

function Chip({ value, label, long, Icon, info, onPress }) {
  return (
    <Pressable style={styles.chipWrap} onPress={onPress}>
      <Card padded={false} contentStyle={styles.chipInner}>
        {Icon ? <Icon size={18} strokeWidth={1.6} color={colors.textSub} style={styles.chipIcon} /> : null}
        <Text style={[styles.chipNum, long && styles.chipNumLong]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        <View style={styles.chipLblRow}>
          <Text style={styles.chipLbl}>{label}</Text>
          {info}
        </View>
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
  chipLblRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  chipLbl: { fontSize: 11, fontWeight: '500', color: colors.textSub },
})
