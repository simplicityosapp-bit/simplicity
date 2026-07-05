import { useMemo } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { eventsByDate, fmtDayLabel, fmtTime, startOfDay } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHeader from '../components/ScreenHeader'
import Card from '../components/Card'
import { colors } from '../theme/theme'
import { useCalendarData } from '../hooks/useCalendarData'

// Calendar screen — an upcoming agenda. Meetings + synced calendar events are
// normalized to { when, title } and grouped by day with core eventsByDate, over
// the per-screen photo (Warm Precision theme). (Month grid is a later increment.)
export default function CalendarScreen() {
  const { meetings, calendarEvents, clients, groups, loading, error, refetch } = useCalendarData()

  const days = useMemo(() => {
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

    const today0 = startOfDay(new Date())
    const upcoming = out
      .filter((e) => new Date(e.when) >= today0)
      .sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime())

    // eventsByDate groups in insertion (already time-sorted) order; sort the day
    // buckets by their first event's time (dateKey is unpadded, so no string sort).
    return [...eventsByDate(upcoming).entries()]
      .map(([key, events]) => ({ key, when: events[0].when, events }))
      .sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime())
  }, [meetings, calendarEvents, clients, groups])

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
                      <View style={[styles.dot, e.kind === 'meeting' ? styles.dotMeeting : styles.dotCal]} />
                      <Text style={styles.eventTitle} numberOfLines={1}>{e.title || '—'}</Text>
                    </View>
                  ))}
                </Card>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>—</Text>
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
  dotMeeting: { backgroundColor: colors.brand },
  dotCal: { backgroundColor: colors.positive },
  eventTitle: { flex: 1, fontSize: 15, color: colors.text },
})
