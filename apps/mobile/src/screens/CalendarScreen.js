import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { ChevronLeft, ChevronRight, Check } from 'lucide-react-native'
import { fmtTime, fmtMonthYear, fmtDayLabel, remindersUpcoming, weekStartIndex } from '@simplicity/core'
import i18n from '../lib/i18n'
import { usePreferences } from '../lib/preferences'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import AddMeetingModal from '../modals/AddMeetingModal'
import EventDetailsModal from '../modals/EventDetailsModal'
import { colors } from '../theme/theme'
import { useCalendarData } from '../hooks/useCalendarData'

// Calendar screen (mirrors web): a month grid of the merged feed (meetings +
// synced events + reminders + lead follow-ups) with per-day dots, plus the
// selected day's agenda below. Tap a day to see its events. (Event creation /
// tap-to-confirm are later increments.)
const KIND_COLOR = { meeting: colors.positive, calendar: colors.moonDeep, reminder: colors.amberWarn, followup: colors.brand }
const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
const pad = (n) => String(n).padStart(2, '0')
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export default function CalendarScreen() {
  const { meetings, calendarEvents, clients, groups, reminders, leads, loading, error, refetch, addMeeting, confirmMeeting, skipMeeting, updateEvent, deleteEvent } = useCalendarData()
  const { prefs } = usePreferences()
  const weekStart = weekStartIndex(prefs?.format?.week_start)   // 0=Sun, 1=Mon (mirrors web)
  const weekdays = weekStart ? [...WEEKDAYS.slice(weekStart), ...WEEKDAYS.slice(0, weekStart)] : WEEKDAYS
  const now = new Date()
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1))
  const [selected, setSelected] = useState(() => keyOf(now))
  const [adding, setAdding] = useState(false)
  const [detail, setDetail] = useState(null)   // agenda row tapped → EventDetailsModal
  const KIND_TAG = {
    reminder: i18n.t('calendar:kinds.reminder', { defaultValue: 'תזכורת' }),
    followup: i18n.t('calendar:kinds.followup', { defaultValue: 'מעקב' }),
  }

  // Normalize the whole feed → { id, when, title, kind }.
  const events = useMemo(() => {
    const out = []
    meetings.filter((m) => ['pending', 'confirmed'].includes(m.status) && m.scheduled_at).forEach((m) => {
      const isGroup = m.subject_type === 'group'
      const subj = isGroup ? groups.find((g) => g.id === m.subject_id) : clients.find((c) => c.id === m.subject_id)
      out.push({ id: `m-${m.id}`, when: m.scheduled_at, title: subj?.name || '', kind: 'meeting', pending: m.status === 'pending', status: m.status, mid: m.id, raw: m })
    })
    calendarEvents.filter((e) => !e.deleted_at && e.start_time).forEach((e) => out.push({ id: `c-${e.id}`, when: e.start_time, title: e.title || e.summary || '', kind: 'calendar', end: e.end_time, raw: e }))
    remindersUpcoming(now, reminders, 120, 0).forEach((r, i) => out.push({ id: `r-${r.id || i}`, when: r.when, title: r.title || '', kind: 'reminder' }))
    leads.filter((l) => !l.deleted_at && l.follow_up_date && l.status_meta === 'in_process').forEach((l) => out.push({ id: `l-${l.id}`, when: `${String(l.follow_up_date).slice(0, 10)}T09:00:00`, title: l.name || '', kind: 'followup' }))
    return out
  }, [meetings, calendarEvents, clients, groups, reminders, leads]) // eslint-disable-line react-hooks/exhaustive-deps

  const byDay = useMemo(() => {
    const m = new Map()
    events.forEach((e) => { const k = keyOf(new Date(e.when)); if (!m.has(k)) m.set(k, []); m.get(k).push(e) })
    m.forEach((list) => list.sort((a, b) => new Date(a.when) - new Date(b.when)))
    return m
  }, [events])

  // Build the 6-week grid for `month` (Sunday-start).
  const weeks = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const start = (first.getDay() - weekStart + 7) % 7 // leading blanks from the chosen week start
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < start; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d))
    while (cells.length % 7 !== 0) cells.push(null)
    const rows = []
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
    return rows
  }, [month, weekStart])

  const todayKey = keyOf(now)
  const selectedEvents = byDay.get(selected) || []
  const stepMonth = (n) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1))

  return (
    <Screen name="calendar">
      {loading && !events.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          <ScreenHead
            title={i18n.t('calendar:title', { defaultValue: 'יומן' })}
            tagline={i18n.t('calendar:tagline', { defaultValue: 'יום אחרי יום, צעד אחרי צעד.' })}
            onAdd={() => setAdding(true)}
            addLabel={i18n.t('calendar:newEventAria', { defaultValue: 'פגישה חדשה' })}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Month grid */}
          <Card contentStyle={styles.grid}>
            <View style={styles.monthNav}>
              <Pressable onPress={() => stepMonth(-1)} hitSlop={10}><ChevronRight size={22} strokeWidth={1.8} color={colors.brand} /></Pressable>
              <Text style={styles.monthLabel}>{fmtMonthYear(month)}</Text>
              <Pressable onPress={() => stepMonth(1)} hitSlop={10}><ChevronLeft size={22} strokeWidth={1.8} color={colors.brand} /></Pressable>
            </View>
            <View style={styles.weekHead}>
              {weekdays.map((w) => <Text key={w} style={styles.weekday}>{w}</Text>)}
            </View>
            {weeks.map((row, ri) => (
              <View key={ri} style={styles.week}>
                {row.map((cell, ci) => {
                  if (!cell) return <View key={ci} style={styles.cell} />
                  const k = keyOf(cell)
                  const evs = byDay.get(k) || []
                  const isToday = k === todayKey
                  const isSel = k === selected
                  return (
                    <Pressable key={ci} style={styles.cell} onPress={() => setSelected(k)}>
                      <View style={[styles.cellInner, isSel && styles.cellSel, isToday && !isSel && styles.cellToday]}>
                        <Text style={[styles.cellNum, isSel && styles.cellNumSel, isToday && !isSel && styles.cellNumToday]}>{cell.getDate()}</Text>
                        <View style={styles.dots}>
                          {evs.slice(0, 3).map((e, i) => <View key={i} style={[styles.evDot, { backgroundColor: isSel ? colors.onBrand : (KIND_COLOR[e.kind] || colors.textFaint) }]} />)}
                        </View>
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            ))}
          </Card>

          {/* Selected day agenda */}
          <Text style={styles.dayLabel}>{fmtDayLabel(`${selected}T00:00:00`)}</Text>
          {selectedEvents.length ? (
            <Card padded={false}>
              {selectedEvents.map((e, i) => {
                const tappable = e.kind === 'meeting' || e.kind === 'calendar'
                return (
                  <Pressable key={e.id} style={[styles.row, i > 0 && styles.rowBorder]} onPress={tappable ? () => setDetail(e) : undefined} disabled={!tappable}>
                    <Text style={styles.time}>{fmtTime(e.when)}</Text>
                    <View style={[styles.dot, { backgroundColor: KIND_COLOR[e.kind] || colors.textFaint }]} />
                    <Text style={styles.eventTitle} numberOfLines={1}>{e.title || '—'}</Text>
                    {e.pending ? (
                      <Pressable style={styles.confirm} onPress={() => confirmMeeting(e.raw)} hitSlop={6}>
                        <Check size={14} strokeWidth={2.2} color={colors.positive} />
                      </Pressable>
                    ) : KIND_TAG[e.kind] ? <Text style={styles.kindTag}>{KIND_TAG[e.kind]}</Text> : null}
                  </Pressable>
                )
              })}
            </Card>
          ) : (
            <Text style={styles.empty}>{i18n.t('calendar:list.empty', { defaultValue: 'אין אירועים ביום זה.' })}</Text>
          )}
        </ScrollView>
      )}

      <AddMeetingModal open={adding} clients={clients} onClose={() => setAdding(false)} onSave={addMeeting} />
      <EventDetailsModal
        open={!!detail}
        event={detail}
        onClose={() => setDetail(null)}
        onConfirmMeeting={confirmMeeting}
        onSkipMeeting={skipMeeting}
        onUpdateEvent={updateEvent}
        onDeleteEvent={deleteEvent}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 96, gap: 14 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 12 },

  // Grid
  grid: { paddingVertical: 14, paddingHorizontal: 10, gap: 6 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, marginBottom: 4 },
  monthLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  weekHead: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: colors.textSub },
  week: { flexDirection: 'row' },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  cellInner: { width: '100%', height: '100%', borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 3 },
  cellSel: { backgroundColor: colors.brand },
  cellToday: { backgroundColor: 'rgba(139,168,136,0.10)', borderWidth: 1, borderColor: 'rgba(139,168,136,0.45)' },
  cellNum: { fontSize: 13, color: colors.text },
  cellNumSel: { color: colors.onBrand, fontWeight: '600' },
  cellNumToday: { color: colors.text, fontWeight: '600' },
  dots: { flexDirection: 'row', gap: 2, height: 4 },
  evDot: { width: 4, height: 4, borderRadius: 2 },

  // Agenda
  dayLabel: { fontSize: 14, fontWeight: '600', color: colors.textSub, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  time: { fontSize: 13, color: colors.textSub, width: 48 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  eventTitle: { flex: 1, fontSize: 15, color: colors.text },
  kindTag: { fontSize: 11, color: colors.textFaint, backgroundColor: colors.cardFlat, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  confirm: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(139,168,136,0.4)', alignItems: 'center', justifyContent: 'center' },
})
