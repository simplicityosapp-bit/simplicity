import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { View, ScrollView, RefreshControl, Alert } from 'react-native'
import { Text } from '../components/Text'
import { Pressable } from '../components/Pressable'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { homeChips, todayItems, getTileFilters, moonGetData, isr, showSetupCard } from '@simplicity/core'
import i18n from '../lib/i18n'
import { CalendarClock, Wallet, Users } from 'lucide-react-native'
import { useHomeData } from '../hooks/useHomeData'
import { useFormOptions } from '../lib/formOptions'
import { usePreferences } from '../lib/preferences'
import { useBottomPad } from '../lib/bottomBar'
import Screen from '../components/Screen'
import Card from '../components/Card'
import InfoPopover from '../components/InfoPopover'
import TileDrillModal from '../modals/TileDrillModal'
import { colors, space } from '../theme/theme'
import { themed } from '../theme/themed'
import AttentionWidget from './home/AttentionWidget'
import NextTasksWidget from './home/NextTasksWidget'
import MoonWidget, { MoonExpansion } from './home/MoonWidget'
import { useRecordMoonSnapshot } from '../hooks/useMoonSnapshots'
import QuoteWidget from './home/QuoteWidget'
import InsightsWidget from './home/InsightsWidget'
import QuickRow from './home/QuickRow'
import HomeWelcome, { phoneSetupTasks } from './home/HomeWelcome'
import AddGoalEntryModal from '../modals/AddGoalEntryModal'
import { onGenerated } from '../lib/generators'
import { useRecurring } from '../hooks/useRecurring'
import { confirmRemoveTransaction } from '../lib/recurringTx'
import { billPerSessionMeeting } from '../lib/scheduledMeetings'

// Home — greeting + net/clients/today chips (shared core homeChips) + the
// widget stack, over the per-screen background photo (Warm Precision theme).
// Default widget order = web WIDGET_REGISTRY; prefs.widgets.list overrides it.
// 'reminders' is gone from both: web dropped that id when it merged the two
// cards, so for any account whose prefs came from web the mobile reminders
// card was already unreachable — the id simply was not in the stored list.
const DEFAULT_WIDGET_ORDER = ['quote', 'moon', 'insights', 'quick-row', 'attention', 'next-tasks', 'chips']

export default function HomeScreen() {
  const bottomPad = useBottomPad()
  const nav = useNavigation()
  const insets = useSafeAreaInsets()
  const {
    clients, transactions, meetings, calendarEvents, leads, groups,
    tasks, goals, categories, sessions, members, reminders, entries, answers, questions, loading, refreshing, error, refetch, reload, addAnswer, addTask, addEntry, addTransaction, addClient, addLead, addProject, addReminder, addMeeting, addSession, addGoal, addQuestion, confirmMeeting, toggleTask, completeReminder, setTransactionStatus, deleteTransaction, restoreTransaction,
  } = useHomeData()
  const { prefs, update: updatePrefs } = usePreferences()
  const { projects, categories: financeCategories } = useFormOptions()
  const { templates, updateRecurring, refetch: refetchTemplates } = useRecurring()

  /* Deleting a pending transaction asks first and, for a row a live recurring
     rule still owns, pauses the rule — the same helper the finance screen uses.
     It was a bare soft delete here, and now that this app runs the generator
     the row came back on the very next pass. */
  const onDeleteTx = (tx) => confirmRemoveTransaction({ tx, templates, deleteTransaction, restoreTransaction, updateRecurring })

  /* "Happened" from the today tile. A per-session client's confirmation creates
     no session (see confirmScheduledMeeting); whether to charge is asked, as in
     the calendar and on web. */
  const confirmFromDrill = async (it) => {
    if (!it.meeting) return
    await confirmMeeting(it.meeting)
    const c = it.meeting.subject_type === 'client' ? clients.find((x) => x.id === it.meeting.subject_id) : null
    if (c?.billing_mode !== 'per_session') return
    const T = (k, o) => i18n.t(`modalsTask:event.${k}`, o)
    Alert.alert(
      T('title'),
      Number(c.price_per_session) > 0 ? T('billOneOff', { name: c.name, amount: isr(c.price_per_session) }) : T('billOneOffNoPrice', { name: c.name }),
      [
        { text: T('billNo'), style: 'cancel' },
        { text: T('billYes'), onPress: () => { billPerSessionMeeting({ meeting: it.meeting, sessions, addSession }).catch(() => {}) } },
      ],
    )
  }

  // Home is a persistent bottom-tab screen (mounts once), so silently re-pull on
  // every RE-focus to pick up mutations made on other tabs (add a client, complete
  // a task, log a payment). Skip the mount focus — the hook's initial load covers
  // it — and stay silent so content never blanks.
  const firstFocus = useRef(true)
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return }
    reload()
    refetchTemplates()
  }, [reload, refetchTemplates]))
  /* A generation pass (components/Generators) usually lands after this
     screen's first load. The pending income, meetings and booking leads it
     wrote belong on Home now, not on the next focus. */
  useEffect(() => onGenerated(() => reload()), [reload])
  const [openTile, setOpenTile] = useState(null)
  const [moonExpanded, setMoonExpanded] = useState(false)
  /* { goal, cat } a progress entry is being logged for — opened by the "+"
     on a manual goal in the moon expansion, as on web. */
  const [entryTarget, setEntryTarget] = useState(null)
  const filters = useMemo(() => getTileFilters(prefs), [prefs])
  const gender = prefs.design?.gender

  /* The setup card (see home/HomeWelcome). "Continue the intro" clears the
     skip, which is all that released the onboarding gate — App.js then shows
     the flow again, at the step it was left on. */
  const setup = useMemo(() => phoneSetupTasks({ prefs, questions, recurring: templates }), [prefs, questions, templates])
  const showWelcome = !loading && showSetupCard(setup, prefs)
  const openSetupTask = (key) => {
    if (key === 'setup') { updatePrefs({ onboarding: { skipped_at: null } }).catch(() => {}); return }
    if (key === 'questions') nav.navigate('Insights')
    else if (key === 'recurring') nav.navigate('Finance')
  }

  const moonData = useMemo(
    () => ({ goals, categories, entries, transactions, sessions, clients, leads, answers, members, groups }),
    [goals, categories, entries, transactions, sessions, clients, leads, answers, members, groups],
  )
  const moon = useMemo(() => moonGetData(new Date(), moonData), [moonData])
  const attentionData = useMemo(
    () => ({ transactions, scheduled_meetings: meetings, clients, tasks, goals, categories, sessions, leads, members, groups }),
    [transactions, meetings, clients, tasks, goals, categories, sessions, leads, members, groups],
  )
  const chips = useMemo(() => homeChips(new Date(), { clients, transactions, members, groups }, filters), [clients, transactions, members, groups, filters])
  const today = useMemo(
    () => todayItems(new Date(), { meetings, calendarEvents, leads, clients, groups, reminders }, filters.today),
    [meetings, calendarEvents, leads, clients, groups, reminders, filters.today],
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
  // Today's score joins the Moon trend's history (as web's moon widget does) — once the read has settled.
  useRecordMoonSnapshot(moon.overall, moonOn && !loading && !error)
  const restOrder = enabledIds.filter((id) => id !== 'quote' && id !== 'moon')

  const renderWidget = (id) => {
    switch (id) {
      case 'insights': return <InsightsWidget key="insights" questions={questions} answers={answers} addAnswer={addAnswer} />
      case 'quick-row': return <QuickRow key="quick-row" clients={clients} categories={categories} questions={questions} addTask={addTask} addTransaction={addTransaction} addClient={addClient} addLead={addLead} addProject={addProject} addReminder={addReminder} addMeeting={addMeeting} addGoal={addGoal} addQuestion={addQuestion} />
      case 'attention': return (
        <AttentionWidget key="attention" data={attentionData} projects={projects} financeCategories={financeCategories}
          onApproveTx={(id2) => setTransactionStatus(id2, 'confirmed')} onSkipTx={(id2) => setTransactionStatus(id2, 'skipped')} onDeleteTx={onDeleteTx} />
      )
      case 'next-tasks': return <NextTasksWidget key="next-tasks" tasks={tasks} reminders={reminders} onToggle={toggleTask} onCompleteReminder={completeReminder} />
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
        contentContainerStyle={[styles.content, bottomPad, { paddingTop: insets.top + 12 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={colors.brand} />}
      >
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={refetch}><Text style={styles.retry}>↻</Text></Pressable>
          </View>
        ) : null}

        {showWelcome ? (
          <HomeWelcome tasks={setup} onOpen={openSetupTask} onDismiss={() => { updatePrefs({ homeWelcomeDismissed: true }).catch(() => {}) }} />
        ) : null}

        {!loading && (quoteOn || moonOn) ? (
          <View style={styles.topRow}>
            {quoteOn ? <QuoteWidget /> : null}
            {moonOn ? <MoonWidget overall={moon.overall} ended={moon.ended} expanded={moonExpanded} onToggle={() => setMoonExpanded((v) => !v)} /> : null}
          </View>
        ) : null}
        {!loading && moonOn && moonExpanded && moon.overall ? (
          <MoonExpansion scored={moon.scored} conf={moon.overall.confidence} gender={gender} onFull={() => nav.navigate('Moon')} onLogEntry={setEntryTarget} />
        ) : null}

        {/* Widget order + enable/disable follow the user's prefs.widgets (web parity). */}
        {!loading ? restOrder.map((id) => renderWidget(id)) : null}
      </ScrollView>

      <AddGoalEntryModal
        open={!!entryTarget}
        onClose={() => setEntryTarget(null)}
        category={entryTarget?.cat}
        goal={entryTarget?.goal}
        onSave={addEntry}
      />

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
        onConfirm={confirmFromDrill}
      />
    </Screen>
  )
}

/* The "?" is a SIBLING of the chip's pressable, laid over its corner — not a
   button inside a button. Nested, a screen reader announced the whole chip as
   one control and the explainer inside it was unreachable or read twice; on
   web it was invalid HTML (a <button> in a <button>). Overlapping siblings are
   fine: the one drawn later — the "?" — takes the touch where they overlap,
   and the rest of the chip still opens its breakdown. It sits at the start
   corner, opposite the icon. */
function Chip({ value, label, long, Icon, info, onPress }) {
  return (
    <View style={styles.chipWrap}>
      <Pressable onPress={onPress}>
        <Card padded={false} contentStyle={styles.chipInner}>
          {Icon ? <Icon size={18} strokeWidth={1.6} color={colors.textSub} style={styles.chipIcon} /> : null}
          <Text style={[styles.chipNum, long && styles.chipNumLong]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
          <View style={styles.chipLblRow}>
            <Text style={styles.chipLbl}>{label}</Text>
          </View>
        </Card>
      </Pressable>
      {info ? <View style={styles.chipInfo}>{info}</View> : null}
    </View>
  )
}

const styles = themed((c, t) => ({
  content: { paddingHorizontal: space.screenPadH, gap: 8 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(181,99,78,0.12)', borderRadius: 12, padding: 12, marginBottom: 8 },
  errorText: { color: c.danger, fontSize: 13, flex: 1 },
  retry: { color: c.danger, fontSize: 18 },
  topRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 4 },
  chips: { flexDirection: 'row', gap: 12, marginTop: 12 },
  chipWrap: { flex: 1 },
  chipInfo: { position: 'absolute', top: 10, start: 10, zIndex: 2 },
  chipInner: { paddingTop: 26, paddingBottom: 14, paddingHorizontal: 12, alignItems: 'center', gap: 4 },
  chipIcon: { position: 'absolute', top: 12, end: 12 },
  chipNum: { fontSize: 22, fontWeight: '500', color: c.text, fontVariant: ['tabular-nums'] },
  chipNumLong: { fontSize: 18 },
  chipLblRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  chipLbl: { fontSize: 11, fontWeight: '500', color: c.textSub },
}))
