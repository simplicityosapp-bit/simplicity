import { useMemo } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { eventsByDate, fmtDayLabel, fmtTime, startOfDay, remindersUpcoming, statusMetaOfLead } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHeader from '../components/ScreenHeader'
import Card from '../components/Card'
import { colors } from '../theme/theme'
import { useCalendarData } from '../hooks/useCalendarData'

// Calendar screen — an upcoming agenda that merges meetings + synced calendar
// events + reminders + lead follow-ups (mirrors the web feed), normalized to
// { when, title, kind } and grouped by day with core eventsByDate, over the
// per-screen photo. (Month grid + tap-to-confirm are later increments.)
const KIND_COLOR = { meeting: colors.brand, calendar: colors.positive, reminder: colors.amberWarn, followup: colors.moonDeep }

export default function CalendarScreen() {
  const { meetings, calendarEvents, clients, groups, reminders, leads, loading, error, refetch } = useCalendarData()
  const KIND_TAG = {
    reminder: i18n.t('calendar:kinds.reminder', { defaultValue: 'תזכורת' }),
    followup: i18n.t('calendar:kinds.followup', { defaultValue: 'מעקב' }),
  }

  const days = useMemo(() => {
    const now = new Date()
    const out = []
    meetings
      .filter((m) => m.status !== 'skipped' && m.scheduled_at)
      .forEach((m) => {
        const isGroup = m.subject_type === 'group'
        const subj = isGroup ? groups.find((g) => g.id === m.subject_id) : clients.find((c) => c.id === m.subject_id)
        out.push({ id: `m-${m.id}`, when: m.scheduled_at, title: subj?.name || '', kind: 'meeting' })
      })
    calendarEvents
      .filter((e) => !e.deleted_at && e.start_time)
      .forEach((e) => out.push({ id: `c-${e.id}`, when: e.start_time, title: e.title || e.summary || '', kind: 'calendar' }))
    remindersUpcoming(now, reminders, 60, 0)
      .forEach((r, i) => out.push({ id: `r-${r.id || i}`, when: r.when, title: r.title || '', kind: 'reminder' }))
    leads
      .filter((l) => !l.deleted_at && l.follow_up_date && statusMetaOfLead(l) === 'in_process')
      .forEach((l) => out.push({ id: `l-${l.id}`, when: `${String(l.follow_up_date).slice(0, 10)}T09:00:00`, title: l.name || '', kind: 'followup' }))

    const today0 = startOfDay(now)
    const upcoming = out
      .filter((e) => new Date(e.when) >= today0)
      .sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime())

    // eventsByDate groups in insertion (already time-sorted) order; sort the day
    // buckets by their first event's time (dateKey is unpadded, so no string sort).
    return [...eventsByDate(upcoming).entries()]
      .map(([key, events]) => ({ key, when: events[0].when, events }))
      .sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime())
  }, [meetings, calendarEvents, clients, groups, reminders, leads])

  return (
    <Screen name="calendar">
      <ScreenHeader title={i18n.t('calendar:title', { defaultValue: 'יומן' })} />

      {loading && !days.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {days.length ? (
            days.map((d) => (
              <View key={d.key} style={styles.group}>
                <Text style={styles.dayLabel}>{fmtDayLabel(d.when)}</Text>
                <Card padded={false}>
                  {d.events.map((e, i) => (
                    <View key={e.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                      <Text style={styles.time}>{fmtTime(e.when)}</Text>
                      <View style={[styles.dot, { backgroundColor: KIND_COLOR[e.kind] || colors.textFaint }]} />
                      <Text style={styles.eventTitle} numberOfLines={1}>{e.title || '—'}</Text>
                      {KIND_TAG[e.kind] ? <Text style={styles.kindTag}>{KIND_TAG[e.kind]}</Text> : null}
                    </View>
                  ))}
                </Card>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>{i18n.t('calendar:list.empty', { defaultValue: '—' })}</Text>
          )}
        </ScrollView>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 24 },
  group: { gap: 8 },
  dayLabel: { fontSize: 14, fontWeight: '600', color: colors.textSub },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  time: { fontSize: 13, color: colors.textSub, width: 48 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  eventTitle: { flex: 1, fontSize: 15, color: colors.text },
  kindTag: { fontSize: 11, color: colors.textFaint, backgroundColor: colors.cardFlat, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
})
