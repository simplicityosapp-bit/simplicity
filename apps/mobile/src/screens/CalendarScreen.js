import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { eventsByDate, fmtDayLabel, fmtTime, startOfDay } from '@simplicity/core'
import i18n from '../lib/i18n'
import { useCalendarData } from '../hooks/useCalendarData'

// Real Calendar screen (replaces the stub) — an upcoming agenda. Meetings +
// synced calendar events are normalized to { when, title } and grouped by day
// with the shared core eventsByDate. (Month grid is a later increment.)
export default function CalendarScreen() {
  const nav = useNavigation()
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
    <View style={styles.root}>
      <View style={styles.bar}>
        <Pressable onPress={() => nav.goBack()} hitSlop={10}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.title}>{i18n.t('calendar:title', { defaultValue: 'יומן' })}</Text>
        <View style={styles.spacer} />
      </View>

      {loading && !days.length ? (
        <View style={styles.center}><ActivityIndicator color="#C97B5E" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#C97B5E" />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {days.length ? (
            days.map((d) => (
              <View key={d.key} style={styles.group}>
                <Text style={styles.dayLabel}>{fmtDayLabel(d.when)}</Text>
                <View style={styles.card}>
                  {d.events.map((e, i) => (
                    <View key={e.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                      <Text style={styles.time}>{fmtTime(e.when)}</Text>
                      <View style={[styles.dot, e.kind === 'meeting' ? styles.dotMeeting : styles.dotCal]} />
                      <Text style={styles.eventTitle} numberOfLines={1}>{e.title || '—'}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>—</Text>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const BRAND = '#C97B5E'
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fbf7f2' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: 12, paddingHorizontal: 16, gap: 8 },
  back: { fontSize: 30, color: BRAND, lineHeight: 30 },
  title: { fontSize: 18, fontWeight: '600', color: '#3a342e', flex: 1, textAlign: 'center' },
  spacer: { width: 30 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  error: { color: '#c0392b', fontSize: 13 },
  empty: { color: '#a89f95', fontSize: 14, textAlign: 'center', marginTop: 24 },
  group: { gap: 8 },
  dayLabel: { fontSize: 14, fontWeight: '600', color: '#7c6f63' },
  card: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#efe7da', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#f2ece1' },
  time: { fontSize: 13, color: '#7c6f63', width: 48 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotMeeting: { backgroundColor: '#C97B5E' },
  dotCal: { backgroundColor: '#8BA888' },
  eventTitle: { flex: 1, fontSize: 15, color: '#3a342e' },
})
