import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, Linking } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { ArrowLeft, Check, MessageCircle } from 'lucide-react-native'
import { isr, fmtTime, todayItems } from '@simplicity/core'
import Sheet from '../components/Sheet'
import { ClientsTrend, NetBars } from '../screens/home/TileDrillCharts'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Drill-down modal opened by tapping a home chip (ports web TileDrillModal +
// its 3 mobile panels: today / net / clients). Per-tile filters persist under
// prefs.tileFilters[tile]; "פתיחה במלא" routes to the full screen.
const T = (k, o) => i18n.t(`modalsSystem:tileDrill.${k}`, o)
const STATUS_OPTIONS = ['active', 'wandering', 'past', 'no_status']
const NET_RANGES = ['thisWeek', 'thisMonth', 'last30days']
const NET_TYPES = ['both', 'income', 'expense']
const TODAY_KINDS = ['meeting', 'calendar', 'followup']
const DAY_MS = 86400000
const pad2 = (n) => String(n).padStart(2, '0')
const dayKey = (d) => {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10)
  const dt = d instanceof Date ? d : new Date(d)
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
}
const toggleInList = (list, v) => { const a = list || []; return a.includes(v) ? a.filter((x) => x !== v) : [...a, v] }

function clientsTrendValues(clients, days = 30) {
  const out = new Array(days).fill(0)
  const live = clients.filter((c) => !c.deleted_at)
  const now = new Date()
  for (let i = 0; i < days; i += 1) {
    const cutoff = new Date(now.getTime() - (days - 1 - i) * DAY_MS)
    cutoff.setHours(23, 59, 59, 999)
    out[i] = live.filter((c) => (c.created_at ? new Date(c.created_at).getTime() : 0) <= cutoff.getTime()).length
  }
  return out
}
function netTrendValues(transactions, days = 30) {
  const incomes = new Array(days).fill(0)
  const expenses = new Array(days).fill(0)
  const now = new Date()
  const startKey = dayKey(new Date(now.getTime() - (days - 1) * DAY_MS))
  const idxMap = new Map()
  for (let i = 0; i < days; i += 1) idxMap.set(dayKey(new Date(now.getTime() - (days - 1 - i) * DAY_MS)), i)
  ;(transactions || []).forEach((t) => {
    if (t.deleted_at || t.status !== 'confirmed') return
    const k = dayKey(t.date)
    if (k < startKey) return
    const idx = idxMap.get(k)
    if (idx == null) return
    if (t.type === 'income') incomes[idx] += t.amount
    else if (t.type === 'expense') expenses[idx] += t.amount
  })
  return { incomes, expenses }
}
const statusLabel = (meta) => (STATUS_OPTIONS.includes(meta) ? T(`status.${meta}`) : (meta || '—'))

function Pills({ options, value, onChange, multi = false, label }) {
  return (
    <View style={styles.pills}>
      {options.map((k) => {
        const active = multi ? (value || []).includes(k) : value === k
        return (
          <Pressable key={k} style={[styles.pill, active && styles.pillOn]} onPress={() => onChange(multi ? toggleInList(value, k) : k)}>
            <Text style={[styles.pillText, active && styles.pillTextOn]}>{label(k)}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}
function MultiPills({ items, selected, onChange, allLabel, emptyLabel }) {
  if (!items?.length) return <Text style={styles.emptyInline}>{emptyLabel}</Text>
  const list = selected || []
  return (
    <View style={styles.pills}>
      <Pressable style={[styles.pill, list.length === 0 && styles.pillOn]} onPress={() => onChange([])}>
        <Text style={[styles.pillText, list.length === 0 && styles.pillTextOn]}>{allLabel}</Text>
      </Pressable>
      {items.map((it) => {
        const active = list.includes(it.id)
        return (
          <Pressable key={it.id} style={[styles.pill, active && styles.pillOn]} onPress={() => onChange(toggleInList(list, it.id))}>
            {it.color ? <View style={[styles.pillDot, { backgroundColor: it.color }]} /> : null}
            <Text style={[styles.pillText, active && styles.pillTextOn]}>{it.name}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function ClientsPanel({ filters, setFilter, clients, projects, groups }) {
  const live = clients.filter((c) => !c.deleted_at)
  const filtered = useMemo(() => live.filter((c) => {
    const meta = c.status_meta || c.status
    if (filters.statuses?.length && !filters.statuses.includes(meta)) return false
    if (filters.projectIds?.length && !filters.projectIds.includes(c.project_id)) return false
    if (filters.groupIds?.length && !filters.groupIds.includes(c.group_id)) return false
    return true
  }), [live, filters])
  const trend = useMemo(() => clientsTrendValues(live, 30), [live])
  return (
    <>
      <Text style={styles.num}>{filtered.length}</Text>
      <Text style={styles.numLbl}>{T('clients.matchingNum')}</Text>
      <View style={styles.chartBlock}>
        <Text style={styles.chartLbl}>{T('clients.trendLbl')}</Text>
        <ClientsTrend values={trend} />
      </View>
      <Text style={styles.fieldLbl}>{T('clients.statusLbl')}</Text>
      <Pills options={STATUS_OPTIONS} value={filters.statuses} multi label={(k) => T(`status.${k}`)} onChange={(v) => setFilter('statuses', v)} />
      <Text style={styles.fieldLbl}>{T('clients.projectLbl')}</Text>
      <MultiPills items={projects} selected={filters.projectIds} onChange={(v) => setFilter('projectIds', v)} allLabel={T('all')} emptyLabel={T('clients.noProjects')} />
      <Text style={styles.fieldLbl}>{T('clients.groupLbl')}</Text>
      <MultiPills items={groups} selected={filters.groupIds} onChange={(v) => setFilter('groupIds', v)} allLabel={T('all')} emptyLabel={T('clients.noGroups')} />
      <Text style={styles.sectionLbl}>{T('clients.matchingSection', { count: filtered.length })}</Text>
      <View style={styles.list}>
        {filtered.length === 0 ? <Text style={styles.empty}>{T('clients.emptyFilter')}</Text> : filtered.slice(0, 8).map((c) => (
          <View key={c.id} style={styles.listRow}>
            <Text style={styles.listName} numberOfLines={1}>{c.name}</Text>
            <Text style={styles.listMeta}>{statusLabel(c.status_meta || c.status)}</Text>
          </View>
        ))}
        {filtered.length > 8 ? <Text style={styles.listMore}>{T('clients.moreCount', { count: filtered.length - 8 })}</Text> : null}
      </View>
    </>
  )
}

function NetPanel({ filters, setFilter, transactions, projects, categories, summary }) {
  const trend = useMemo(() => netTrendValues(transactions || [], 30), [transactions])
  return (
    <>
      <Text style={[styles.num, summary.net < 0 && { color: colors.danger }]}>{summary.net < 0 ? '−' : ''}{isr(Math.abs(summary.net || 0))}</Text>
      <Text style={styles.numLbl}>{filters.type === 'income' ? T('net.income') : filters.type === 'expense' ? T('net.expense') : T('net.net')}</Text>
      <View style={styles.chartBlock}>
        <Text style={styles.chartLbl}>{T('net.trendLbl')}</Text>
        <NetBars incomes={trend.incomes} expenses={trend.expenses} />
        <View style={styles.legend}>
          <View style={styles.legendKey}><View style={[styles.swatch, { backgroundColor: colors.positive }]} /><Text style={styles.legendText}>{T('net.legendIncome')}</Text></View>
          <View style={styles.legendKey}><View style={[styles.swatch, { backgroundColor: colors.danger }]} /><Text style={styles.legendText}>{T('net.legendExpense')}</Text></View>
        </View>
      </View>
      <Text style={styles.fieldLbl}>{T('net.timeRangeLbl')}</Text>
      <Pills options={NET_RANGES} value={filters.timeRange} label={(k) => T(`netRanges.${k}`)} onChange={(v) => setFilter('timeRange', v)} />
      <Text style={styles.fieldLbl}>{T('net.typeLbl')}</Text>
      <Pills options={NET_TYPES} value={filters.type} label={(k) => T(`netTypes.${k}`)} onChange={(v) => setFilter('type', v)} />
      <Text style={styles.fieldLbl}>{T('net.projectLbl')}</Text>
      <MultiPills items={projects} selected={filters.projectIds} onChange={(v) => setFilter('projectIds', v)} allLabel={T('all')} emptyLabel={T('net.noProjects')} />
      <Text style={styles.fieldLbl}>{T('net.categoryLbl')}</Text>
      <MultiPills items={categories} selected={filters.categoryIds} onChange={(v) => setFilter('categoryIds', v)} allLabel={T('all')} emptyLabel={T('net.noCategories')} />
      <View style={styles.miniStats}>
        <View style={styles.mini}><Text style={styles.miniL}>{T('net.miniIncome')}</Text><Text style={styles.miniV}>{isr(summary._income || 0)}</Text></View>
        <View style={styles.mini}><Text style={styles.miniL}>{T('net.miniExpense')}</Text><Text style={styles.miniV}>{isr(summary._expense || 0)}</Text></View>
        <View style={styles.mini}><Text style={styles.miniL}>{T('net.miniTx')}</Text><Text style={styles.miniV}>{summary._txCount || 0}</Text></View>
      </View>
    </>
  )
}

function MeetingsPanel({ filters, setFilter, items, onConfirm }) {
  const kinds = filters.kinds && filters.kinds.length ? filters.kinds : TODAY_KINDS
  const whatsapp = (it) => { const p = (it.phone || '').replace(/\D/g, ''); if (p) Linking.openURL(`https://wa.me/${p}`) }
  return (
    <>
      <Text style={styles.num}>{items.length}</Text>
      <Text style={styles.numLbl}>{T('today.matchingNum')}</Text>
      <Text style={styles.fieldLbl}>{T('today.kindsLbl')}</Text>
      <Pills options={TODAY_KINDS} value={kinds} multi label={(k) => T(`todayKinds.${k}`)} onChange={(v) => setFilter('kinds', v.length ? v : TODAY_KINDS)} />
      <Text style={styles.sectionLbl}>{T('today.listSection')}</Text>
      <View style={styles.list}>
        {items.length === 0 ? <Text style={styles.empty}>{T('today.empty')}</Text> : items.map((it) => (
          <View key={it.id} style={styles.todayRow}>
            <View style={styles.todayMain}>
              <Text style={styles.todayTime}>{it.allDay ? T('today.allDay') : fmtTime(it.when)}</Text>
              <Text style={styles.todayName} numberOfLines={1}>{it.title || T(`todayKinds.${it.kind}`)}</Text>
              <Text style={[styles.todayKind, { color: it.kind === 'meeting' ? colors.positive : it.kind === 'calendar' ? colors.moonDeep : colors.brand }]}>{T(`todayKinds.${it.kind}`)}</Text>
            </View>
            <View style={styles.todayActs}>
              {it.phone ? <Pressable style={styles.todayAct} onPress={() => whatsapp(it)} hitSlop={6}><MessageCircle size={15} strokeWidth={1.7} color={colors.positive} /></Pressable> : null}
              {it.kind === 'meeting' ? (
                it.status === 'confirmed' ? (
                  <View style={styles.todayDone}><Check size={14} strokeWidth={2.4} color={colors.positive} /></View>
                ) : onConfirm ? (
                  <Pressable style={styles.todayConfirm} onPress={() => onConfirm(it)} hitSlop={6} accessibilityLabel={T('today.markHappened')}><Check size={15} strokeWidth={2} color={colors.onBrand} /></Pressable>
                ) : null
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </>
  )
}

export default function TileDrillModal({
  open, onClose, tile,
  prefs, updatePrefs, filters,
  clients = [], groups = [], projects = [], categories = [],
  transactions = [], netSummary = {},
  meetings = [], calendarEvents = [], leads = [], onConfirm,
}) {
  const nav = useNavigation()
  const setFilter = (key, value) => {
    const nextTile = { ...(filters || {}), [key]: value }
    updatePrefs?.({ tileFilters: { ...(prefs?.tileFilters || {}), [tile]: nextTile } })
  }
  const todayKinds = filters?.kinds
  const todayList = useMemo(
    () => (tile === 'today' ? todayItems(new Date(), { meetings, calendarEvents, leads, clients, groups }, { kinds: todayKinds }) : []),
    [tile, meetings, calendarEvents, leads, clients, groups, todayKinds],
  )
  // clients/net are tab routes (under Main); today's full view is the Calendar
  // stack route.
  const openFull = () => {
    onClose()
    if (tile === 'clients') nav.navigate('Main', { screen: 'Clients' })
    else if (tile === 'net') nav.navigate('Main', { screen: 'Finance' })
    else if (tile === 'today') nav.navigate('Calendar')
  }

  return (
    <Sheet open={open} onClose={onClose} title={tile ? T(`titles.${tile}`) : ''}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
        {tile === 'clients' ? <ClientsPanel filters={filters || {}} setFilter={setFilter} clients={clients} projects={projects} groups={groups} /> : null}
        {tile === 'net' ? <NetPanel filters={filters || {}} setFilter={setFilter} transactions={transactions} projects={projects} categories={categories} summary={netSummary} /> : null}
        {tile === 'today' ? <MeetingsPanel filters={filters || {}} setFilter={setFilter} items={todayList} onConfirm={onConfirm} /> : null}
      </ScrollView>
      <View style={styles.actions}>
        <Pressable style={styles.cancelBtn} onPress={onClose}><Text style={styles.cancelText}>{T('close')}</Text></Pressable>
        <Pressable style={styles.saveBtn} onPress={openFull}>
          <ArrowLeft size={14} strokeWidth={1.8} color={colors.onBrand} />
          <Text style={styles.saveText}>{T('openFull')}</Text>
        </Pressable>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 460 },
  scrollBody: { paddingBottom: 8 },
  num: { fontSize: 34, fontWeight: '600', color: colors.text, textAlign: 'center', fontVariant: ['tabular-nums'] },
  numLbl: { fontSize: 12, color: colors.textSub, textAlign: 'center', marginTop: 2, marginBottom: 8 },
  chartBlock: { marginVertical: 8 },
  chartLbl: { fontSize: 11, fontWeight: '500', color: colors.textFaint, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  legend: { flexDirection: 'row', gap: 16, marginTop: 6, justifyContent: 'center' },
  legendKey: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 9, height: 9, borderRadius: 2 },
  legendText: { fontSize: 11, color: colors.textSub },
  fieldLbl: { fontSize: 12, fontWeight: '500', color: colors.textSub, marginTop: 12, marginBottom: 6 },
  sectionLbl: { fontSize: 12, fontWeight: '600', color: colors.textSub, marginTop: 14, marginBottom: 6, letterSpacing: 0.3 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat },
  pillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { fontSize: 13, color: colors.textSub },
  pillTextOn: { color: colors.onBrand, fontWeight: '600' },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  emptyInline: { fontSize: 12, color: colors.textFaint, paddingVertical: 4 },
  list: { gap: 2, marginTop: 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  listName: { flex: 1, fontSize: 14, color: colors.text },
  listMeta: { fontSize: 12, color: colors.textSub },
  listMore: { fontSize: 12, color: colors.textFaint, paddingTop: 6, textAlign: 'center' },
  empty: { fontSize: 13, color: colors.textFaint, textAlign: 'center', paddingVertical: 10 },
  miniStats: { flexDirection: 'row', gap: 8, marginTop: 14 },
  mini: { flex: 1, alignItems: 'center', gap: 2, backgroundColor: 'rgba(42,37,32,0.04)', borderRadius: 12, paddingVertical: 10 },
  miniL: { fontSize: 10, color: colors.textSub },
  miniV: { fontSize: 15, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  // today rows
  todayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  todayMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  todayTime: { fontSize: 12, color: colors.textSub, fontVariant: ['tabular-nums'], width: 42 },
  todayName: { flex: 1, fontSize: 14, color: colors.text },
  todayKind: { fontSize: 11, fontWeight: '600' },
  todayActs: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  todayAct: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardFlat },
  todayConfirm: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.positive },
  todayDone: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,168,136,0.2)' },
  // footer
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '500', color: colors.textSub },
  saveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.brand },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
})
