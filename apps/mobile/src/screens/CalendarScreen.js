import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { View, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, I18nManager, Linking } from 'react-native'
import { Text } from '../components/Text'
import { Pressable } from '../components/Pressable'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { ChevronLeft, ChevronRight, Check, CloudOff, SlidersHorizontal, CalendarClock, CalendarPlus, Clock, CheckSquare, Banknote, MessageCircle } from 'lucide-react-native'
import {
  fmtTime, fmtMonthYear, fmtDayLabel, fmtShortDate, formatWhen, formatDaySpan, remindersUpcoming, weekStartIndex, eventsByDate,
  weekdayNamesShort, findCalendarDuplicates, isNearExactDuplicate, waLink,
} from '@simplicity/core'
import i18n from '../lib/i18n'
import { usePreferences } from '../lib/preferences'
import { pushUndo } from '../lib/undo'
import { showError } from '../lib/toast'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import Sheet from '../components/Sheet'
import AddMeetingModal from '../modals/AddMeetingModal'
import AddReminderModal from '../modals/AddReminderModal'
import AddTaskModal from '../modals/AddTaskModal'
import AddTransactionModal from '../modals/AddTransactionModal'
import EventDetailsModal from '../modals/EventDetailsModal'
import { colors } from '../theme/theme'
import { themed, themedMap } from '../theme/themed'
import { useCalendarData } from '../hooks/useCalendarData'
import { useWhatsAppMessage } from '../hooks/useWhatsAppMessage'
import { useBottomPad } from '../lib/bottomBar'
import { useGoogleCalendarAutoSync } from '../hooks/useGoogleCalendar'

/* ════════════════════════════════════════════════════════════════
   CALENDAR — the merged feed: meetings, synced / booked events,
   reminders and lead follow-ups.
   ════════════════════════════════════════════════════════════════
   Two views, as far as a phone needs web's four: the agenda list ("לוח",
   web's default) and the month grid with the chosen day below it. Web's
   day and week grids are the desktop's; a coach who picked one there gets
   the month grid here, and the choice is shared through
   prefs.calendarDefaultView.

   Everything a row stands for opens: meetings (confirm, reschedule,
   cancel), events and the bookings behind them, reminders and follow-ups
   — the last two used to be rows that could not be tapped. The view filter
   (types, and the agenda's hidden weekdays), duplicate detection against
   Google, and the "new" chooser are web's.
   ════════════════════════════════════════════════════════════════ */
const KIND_COLOR = themedMap((c) => ({ meeting: c.positive, calendar: c.moonDeep, reminder: c.amberWarn, leadFollowup: c.brand }))
const FALLBACK_WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
const VIEWS = ['schedule', 'month']
const PAGE = 30
const FILTER_KINDS = [
  { key: 'meeting', label: 'meetingLabel', sub: 'meetingSub' },
  { key: 'reminder', label: 'reminderLabel', sub: 'reminderSub' },
  { key: 'leadFollowup', label: 'followupLabel', sub: 'followupSub' },
  { key: 'calendar', label: 'calendarLabel', sub: 'calendarSub' },
]
const ADD_OPTIONS = [
  { key: 'meeting', label: 'meetingLabel', hint: 'meetingHint', Icon: CalendarPlus },
  { key: 'reminder', label: 'reminderLabel', hint: 'reminderHint', Icon: Clock },
  { key: 'task', label: 'taskLabel', hint: 'taskHint', Icon: CheckSquare },
  { key: 'transaction', label: 'transactionLabel', hint: 'transactionHint', Icon: Banknote },
]
const pad = (n) => String(n).padStart(2, '0')
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const tr = (k, o) => i18n.t(`calendar:${k}`, o)

export default function CalendarScreen() {
  const bottomPad = useBottomPad()
  const {
    meetings, calendarEvents, clients, groups, reminders, leads, sessions, bookings, bookingPages, meetingTypes, projects,
    loading, error, refetch,
    addMeeting, confirmMeeting, skipMeeting, rescheduleMeeting, setMeetingStatus, updateMeeting, addSession,
    updateEvent, deleteEvent, restoreEvent, cancelBooking,
    completeReminder, removeReminder, clearFollowup, addReminder, addTask, addTransaction,
  } = useCalendarData()
  const { prefs, update: updatePrefs } = usePreferences()
  const navigation = useNavigation()
  const waMsg = useWhatsAppMessage()
  /* Pull new Google Calendar events while this screen is open, as web's
     calendar does, and reload the feed after each pull. */
  const { failing: syncFailing } = useGoogleCalendarAutoSync({ onSynced: () => refetch(true) })
  // Persistent tab: silently re-pull on RE-focus so a meeting/session/reminder
  // added elsewhere reflects on return (skip mount).
  const firstFocus = useRef(true)
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return }
    refetch(true)
  }, [refetch]))
  const weekStart = weekStartIndex(prefs?.format?.week_start)   // 0=Sun, 1=Mon (mirrors web)
  const dayNames = (() => {
    const names = weekdayNamesShort()
    return Array.isArray(names) && names.length === 7 ? names : FALLBACK_WEEKDAYS
  })()
  const weekdays = weekStart ? [...dayNames.slice(weekStart), ...dayNames.slice(0, weekStart)] : dayNames
  // Manual RTL flip for the LTR-engine Hebrew state (no-op on a real RTL device):
  // mirror the week header + day grid (Sunday on the right) and the agenda rows.
  const flip = (i18n.language || '').startsWith('he') && !I18nManager.isRTL
  const flipRow = flip ? styles.rowFlip : null
  const now = new Date()
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1))
  const [selected, setSelected] = useState(() => keyOf(now))
  const [adding, setAdding] = useState(null)   // null | 'choose' | 'meeting' | 'reminder' | 'task' | 'transaction'
  const [detail, setDetail] = useState(null)   // row tapped → EventDetailsModal
  const [showFilter, setShowFilter] = useState(false)
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [limit, setLimit] = useState(PAGE)

  /* The view is shared with web. Web's own default is the agenda, so an unset
     preference opens there; day and week are desktop grids, read as month. */
  const view = !prefs?.calendarDefaultView || prefs.calendarDefaultView === 'schedule' ? 'schedule' : 'month'
  const setView = (v) => { if (v !== view) updatePrefs?.({ calendarDefaultView: v }) }

  /* What the calendar shows (web CalendarFilterModal): event types in
     prefs.calendarFilter (absent = shown), and the weekdays the agenda hides
     in prefs.scheduleHiddenDays. The header dot answers for both. */
  const cf = prefs?.calendarFilter || {}
  const kindsShown = { meeting: cf.meeting !== false, reminder: cf.reminder !== false, calendar: cf.calendar !== false, leadFollowup: cf.leadFollowup !== false }
  const setKind = (key, value) => updatePrefs?.({ calendarFilter: { ...kindsShown, [key]: value } })
  const hiddenDays = Array.isArray(prefs?.scheduleHiddenDays) ? prefs.scheduleHiddenDays : []
  const toggleDay = (d) => updatePrefs?.({ scheduleHiddenDays: hiddenDays.includes(d) ? hiddenDays.filter((x) => x !== d) : [...hiddenDays, d] })
  const filterActive = Object.values(kindsShown).some((v) => !v) || hiddenDays.length > 0

  // Normalize the whole feed (web calendar allEvents).
  const events = useMemo(() => {
    const out = []
    const subjectName = (m) => (m.subject_type === 'group'
      ? groups.find((g) => g.id === m.subject_id)?.name || tr('fallback.group')
      : clients.find((c) => c.id === m.subject_id)?.name || tr('fallback.client'))
    /* How long a meeting runs, in order of who knows: the meeting's own
       duration, then the subject's weekly-slot end time, then nothing. */
    const meetingEnd = (m, start) => {
      const own = Number(m.duration_minutes)
      if (Number.isFinite(own) && own > 0) return new Date(start.getTime() + own * 60_000).toISOString()
      const subj = m.subject_type === 'group' ? groups.find((g) => g.id === m.subject_id) : clients.find((c) => c.id === m.subject_id)
      const hhmm = subj?.recurring_end_time && String(subj.recurring_end_time).match(/^(\d{1,2}):(\d{2})/)
      if (!hhmm) return null
      const end = new Date(start)
      end.setHours(Number(hhmm[1]), Number(hhmm[2]), 0, 0)
      return end > start ? end.toISOString() : null
    }
    meetings.filter((m) => ['pending', 'confirmed'].includes(m.status) && m.scheduled_at).forEach((m) => {
      const start = new Date(m.scheduled_at)
      // Only a 1-on-1 meeting can be reminded over WhatsApp — a group has no single number.
      const client = m.subject_type === 'client' ? clients.find((c) => c.id === m.subject_id) : null
      out.push({
        id: `m-${m.id}`, kind: 'meeting', when: m.scheduled_at, end: meetingEnd(m, start), title: subjectName(m),
        pending: m.status === 'pending', status: m.status, raw: m,
        whatsapp: client ? { phone: client.phone || '', key: 'meeting', vars: { name: client.name, date: fmtShortDate(start), time: fmtTime(start) } } : null,
      })
    })
    /* A booking points back at its event via event_id; the event carries who
       booked, from which page, and what they wrote. */
    const bookingByEvent = new Map((bookings || []).filter((b) => b.event_id).map((b) => [b.event_id, b]))
    calendarEvents.filter((e) => !e.deleted_at && e.start_time).forEach((e) => {
      const bk = bookingByEvent.get(e.id)
      out.push({
        id: `c-${e.id}`, kind: 'calendar', when: e.start_time, end: e.end_time, allDay: !!e.all_day, title: e.title || e.summary || tr('fallback.event'), raw: e,
        clientName: e.client_id ? clients.find((c) => c.id === e.client_id)?.name || null : null,
        projectName: e.project_id ? (projects || []).find((p) => p.id === e.project_id)?.name || null : null,
        leadName: e.lead_id ? leads.find((l) => l.id === e.lead_id)?.name || null : null,
        groupName: e.group_id ? groups.find((g) => g.id === e.group_id)?.name || null : null,
        booking: bk ? {
          id: bk.id, name: bk.name, phone: bk.phone || null, email: bk.email || null, note: bk.note || null,
          pageName: (bookingPages || []).find((p) => p.id === bk.page_id)?.title?.trim() || tr('bookingPageFallback'),
          meetingTypeName: bk.meeting_type_id ? (meetingTypes || []).find((mt) => mt.id === bk.meeting_type_id)?.name || null : null,
        } : null,
      })
    })
    remindersUpcoming(now, reminders, 365, 0).forEach((r, i) => {
      const row = reminders.find((x) => x.id === r.id) || r
      const client = row.linked_to_type === 'client' ? clients.find((c) => c.id === row.linked_to_id) : null
      out.push({
        id: `r-${r.id || i}-${r.when}`, kind: 'reminder', when: r.when, title: r.title || '', raw: row,
        whatsapp: { phone: client?.phone || '', key: client?.name ? 'reminder' : 'reminderNoName', vars: { name: client?.name, title: r.title } },
      })
    })
    leads.filter((l) => !l.deleted_at && l.follow_up_date && l.status_meta === 'in_process').forEach((l) => out.push({
      id: `l-${l.id}`, kind: 'leadFollowup', when: `${String(l.follow_up_date).slice(0, 10)}T09:00:00`, title: l.name || tr('fallback.lead'), raw: l,
      whatsapp: { phone: l.phone || '', key: 'lead', vars: { name: l.name } },
    }))
    return out
      .filter((e) => kindsShown[e.kind] !== false)
      .sort((a, b) => new Date(a.when) - new Date(b.when))
  }, [meetings, calendarEvents, clients, groups, reminders, leads, bookings, bookingPages, meetingTypes, projects, cf.meeting, cf.reminder, cf.calendar, cf.leadFollowup]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Per-day buckets. A multi-day event is listed under EVERY day it covers
     (core eventsByDate, which web's month view uses). Core keys its map
     y-m(0-based)-d; the grid here uses padded ISO days. */
  const byDay = useMemo(() => {
    const m = new Map()
    eventsByDate(events).forEach((list, k) => {
      const [y, mo, d] = k.split('-').map(Number)
      m.set(keyOf(new Date(y, mo, d)), [...list].sort((a, b) => new Date(a.when) - new Date(b.when)))
    })
    return m
  }, [events])

  /* The agenda: from the start of today on, minus the weekdays the coach
     switched off (the list only — the month grid still draws every day). */
  const scheduleItems = useMemo(() => {
    const sod = new Date(); sod.setHours(0, 0, 0, 0)
    const hidden = new Set(hiddenDays)
    return events.filter((e) => new Date(e.when) >= sod && !hidden.has(new Date(e.when).getDay()))
  }, [events, hiddenDays])

  // Build the 6-week grid for `month`.
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

  /* Duplicates against Google (core findCalendarDuplicates). Near-exact pairs
     hide the Google mirror automatically — never the app meeting, which
     carries the billing — with one batched undo; the rest wait on the banner.
     An owned event (kept or restored by the coach) is never auto-hidden, and
     each event is tried once per session so a failed hide cannot loop. */
  const duplicates = useMemo(
    () => findCalendarDuplicates({ meetings, calendarEvents, clients, groups }),
    [meetings, calendarEvents, clients, groups],
  )
  const attempted = useRef(new Set())
  useEffect(() => {
    const tight = duplicates.filter((d) => !d.event.owned && !attempted.current.has(d.event.id) && isNearExactDuplicate(d))
    if (!tight.length) return
    const evs = tight.map((d) => d.event)
    evs.forEach((ev) => attempted.current.add(ev.id))
    Promise.all(evs.map((ev) => deleteEvent(ev).catch(() => {})))
    pushUndo({
      label: tr(evs.length === 1 ? 'dup.autoHiddenOne' : 'dup.autoHiddenMany', { count: evs.length }),
      undo: async () => { await Promise.all(evs.map((ev) => restoreEvent(ev))) },
      redo: async () => { await Promise.all(evs.map((ev) => deleteEvent(ev))) },
    })
  }, [duplicates, deleteEvent, restoreEvent])
  const manualDuplicates = duplicates.filter((d) => !isNearExactDuplicate(d) || d.event.owned)
  const hideDupMeeting = (d) => updateMeeting(d.meeting.id, { status: 'skipped' }).catch(() => showError(tr('toast.actionFailed')))
  const hideDupEvent = (d) => deleteEvent(d.event).catch(() => showError(tr('toast.actionFailed')))
  useEffect(() => { if (showDuplicates && !manualDuplicates.length) setShowDuplicates(false) }, [showDuplicates, manualDuplicates.length])

  const todayKey = keyOf(now)
  const selectedEvents = byDay.get(selected) || []
  const stepMonth = (n) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1))

  // Confirm "it happened". A per-session client's meeting only flips status here
  // (no auto-materialise) so it isn't double-counted — its held session is logged
  // through the one-off charge prompt (billSession) instead. Mirrors web calendar.
  const meetingClientFor = (ev) => (ev?.kind === 'meeting' && ev.raw?.subject_type === 'client') ? clients.find((c) => c.id === ev.raw.subject_id) : null
  const handleConfirm = (meeting) => {
    const c = meeting?.subject_type === 'client' ? clients.find((x) => x.id === meeting.subject_id) : null
    if (c?.billing_mode === 'per_session') return setMeetingStatus(meeting.id, 'confirmed')
    return confirmMeeting(meeting)
  }
  const billClient = (() => { const c = meetingClientFor(detail); return c && c.billing_mode === 'per_session' ? c : null })()
  const billSession = (ev) => {
    const c = meetingClientFor(ev)
    if (!c) return Promise.resolve()
    const num = sessions.filter((s) => !s.deleted_at && s.client_id === c.id).length + 1
    return addSession({ date: new Date(ev.when).toISOString(), summary: null, notes: null, client_id: c.id, group_id: null, subject_type: 'client', subject_id: c.id, num })
  }
  /* Opening an event stamps whether its time has passed. "Did it happen?" is
     a past-tense question, and answering it for next week's meeting creates a
     real session. */
  const openEvent = (e) => setDetail({ ...e, isPast: new Date(e.when).getTime() <= Date.now() })
  const openWhatsApp = (w) => Linking.openURL(waLink(w.phone, waMsg(w.key, w.vars))).catch(() => {})

  const renderRow = (e, i, { withDate = false } = {}) => (
    <Pressable key={e.id} style={[styles.row, flipRow, i > 0 && styles.rowBorder]} onPress={() => openEvent(e)} accessibilityRole="button">
      <View style={[styles.dot, { backgroundColor: KIND_COLOR[e.kind] || colors.textFaint }]} />
      <View style={styles.rowBody}>
        <Text style={[styles.eventTitle, flip && styles.eventTitleRtl]} numberOfLines={1}>{e.title || '—'}</Text>
        <Text style={[styles.rowWhen, flip && styles.eventTitleRtl]} numberOfLines={1}>
          {e.allDay
            ? `${withDate ? `${formatDaySpan(e)} · ` : ''}${tr('allDay')}`
            : (withDate ? formatWhen(e.when) : `${fmtTime(e.when)}${e.end ? `–${fmtTime(e.end)}` : ''}`)}
          {e.kind === 'calendar' && (e.booking ? ` · ${[e.booking.pageName, e.booking.meetingTypeName].filter(Boolean).join(' · ')}` : (e.clientName || e.projectName || e.leadName) ? ` · ${e.clientName || e.projectName || e.leadName}` : '')}
        </Text>
      </View>
      {e.pending && new Date(e.when) <= now ? (
        <Pressable accessibilityLabel={i18n.t('modalsSystem:confirm.confirm')} style={styles.confirm} onPress={() => handleConfirm(e.raw)} hitSlop={6}>
          <Check size={14} strokeWidth={2.2} color={colors.positive} />
        </Pressable>
      ) : e.kind === 'meeting' && e.pending ? <Text style={styles.kindTag}>{tr('tag.pending')}</Text>
        : e.kind === 'reminder' ? <Text style={styles.kindTag}>{tr('tag.reminder')}</Text>
          : e.kind === 'calendar' ? <Text style={styles.kindTag}>{tr('tag.calendar')}</Text>
            : e.kind === 'leadFollowup' ? <Text style={styles.kindTag}>{i18n.t('calendar:kinds.followup', { defaultValue: 'מעקב' })}</Text> : null}
      {withDate && e.whatsapp ? (
        <Pressable accessibilityLabel="WhatsApp" style={styles.wa} onPress={() => openWhatsApp(e.whatsapp)} hitSlop={6}>
          <MessageCircle size={15} strokeWidth={1.7} color={colors.positive} />
        </Pressable>
      ) : null}
    </Pressable>
  )

  const shownSchedule = scheduleItems.slice(0, limit)
  const remaining = scheduleItems.length - shownSchedule.length

  return (
    <Screen name="calendar">
      {loading && !events.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, bottomPad]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          <ScreenHead
            title={tr('title', { defaultValue: 'יומן' })}
            onAdd={() => setAdding('choose')}
            addLabel={tr('newEventAria', { defaultValue: 'אירוע חדש' })}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {/* The background sync is silent; this is the one place it speaks — a
              connected calendar that has stopped updating. */}
          {syncFailing ? (
            <Pressable style={styles.banner} onPress={() => navigation.navigate('Connections')} accessibilityRole="button">
              <CloudOff size={15} strokeWidth={1.8} color={colors.amberWarn} />
              <Text style={styles.bannerText}>{tr('syncFailed.text')}</Text>
              <Text style={styles.bannerCta}>{tr('syncFailed.cta')}</Text>
            </Pressable>
          ) : null}
          {manualDuplicates.length ? (
            <Pressable style={styles.banner} onPress={() => setShowDuplicates(true)} accessibilityRole="button">
              <CalendarClock size={15} strokeWidth={1.8} color={colors.amberWarn} />
              <Text style={styles.bannerText}>{manualDuplicates.length === 1 ? tr('dup.one') : tr('dup.many', { count: manualDuplicates.length })}</Text>
              <Text style={styles.bannerCta}>{tr('dup.cta')}</Text>
            </Pressable>
          ) : null}

          {/* View switch + filter */}
          <View style={styles.controls}>
            <View style={styles.seg}>
              {VIEWS.map((v) => {
                const on = view === v
                return (
                  <Pressable key={v} style={[styles.segBtn, on && styles.segOn]} onPress={() => setView(v)} accessibilityState={{ selected: on }}>
                    <Text style={[styles.segText, on && styles.segTextOn]}>{tr(`views.${v}`)}</Text>
                  </Pressable>
                )
              })}
            </View>
            <Pressable style={styles.filterBtn} onPress={() => setShowFilter(true)} accessibilityRole="button" accessibilityLabel={tr('filter')}>
              <SlidersHorizontal size={14} strokeWidth={1.7} color={colors.textSub} />
              <Text style={styles.filterText}>{tr('filter')}</Text>
              {filterActive ? <View style={styles.filterDot} /> : null}
            </Pressable>
          </View>

          {view === 'schedule' ? (
            shownSchedule.length ? (
              <>
                <Card padded={false}>{shownSchedule.map((e, i) => renderRow(e, i, { withDate: true }))}</Card>
                {remaining > 0 ? (
                  <Pressable style={styles.loadMore} onPress={() => setLimit((n) => n + PAGE)} accessibilityRole="button">
                    <Text style={styles.loadMoreText}>{tr('list.loadMore', { count: remaining })}</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <Text style={styles.empty}>{tr('list.empty', { defaultValue: 'אין אירועים ביום זה.' })}</Text>
            )
          ) : (
            <>
              {/* Month grid */}
              <Card contentStyle={styles.grid}>
                <View style={styles.monthNav}>
                  <Pressable accessibilityLabel={tr('nav.prevMonth')} onPress={() => stepMonth(-1)} hitSlop={10}><ChevronRight size={22} strokeWidth={1.8} color={colors.brand} /></Pressable>
                  <Text style={styles.monthLabel}>{fmtMonthYear(month)}</Text>
                  <Pressable accessibilityLabel={tr('nav.nextMonth')} onPress={() => stepMonth(1)} hitSlop={10}><ChevronLeft size={22} strokeWidth={1.8} color={colors.brand} /></Pressable>
                </View>
                <View style={[styles.weekHead, flipRow]}>
                  {weekdays.map((w, i) => <Text key={`${w}-${i}`} style={styles.weekday}>{w}</Text>)}
                </View>
                {weeks.map((row, ri) => (
                  <View key={ri} style={[styles.week, flipRow]}>
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
                <Card padded={false}>{selectedEvents.map((e, i) => renderRow(e, i))}</Card>
              ) : (
                <Text style={styles.empty}>{tr('list.empty', { defaultValue: 'אין אירועים ביום זה.' })}</Text>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* "+ אירוע חדש" — pick what to add (web CalendarAddGate). */}
      <Sheet open={adding === 'choose'} onClose={() => setAdding(null)} title={i18n.t('modalsTask:addGate.title')}>
        {ADD_OPTIONS.map(({ key, label, hint, Icon }) => (
          <Pressable key={key} style={styles.gateOpt} onPress={() => setAdding(key)} accessibilityRole="button">
            <View style={styles.gateIcon}><Icon size={18} strokeWidth={1.7} color={colors.brand} /></View>
            <View style={styles.gateText}>
              <Text style={styles.gateName}>{i18n.t(`modalsTask:addGate.${label}`)}</Text>
              <Text style={styles.gateHint}>{i18n.t(`modalsTask:addGate.${hint}`)}</Text>
            </View>
          </Pressable>
        ))}
      </Sheet>
      <AddMeetingModal open={adding === 'meeting'} clients={clients} groups={groups} onClose={() => setAdding(null)} onSave={addMeeting} />
      <AddReminderModal open={adding === 'reminder'} onClose={() => setAdding(null)} onSave={addReminder} />
      <AddTaskModal open={adding === 'task'} onClose={() => setAdding(null)} onSave={addTask} />
      <AddTransactionModal open={adding === 'transaction'} clients={clients} onClose={() => setAdding(null)} onSave={addTransaction} />

      {/* View filter (web CalendarFilterModal) */}
      <Sheet open={showFilter} onClose={() => setShowFilter(false)} title={i18n.t('modalsTask:filter.title')}>
        <Text style={styles.hint}>{i18n.t('modalsTask:filter.hint')}</Text>
        <Text style={styles.groupHead}>{i18n.t('modalsTask:filter.typesHeading')}</Text>
        {FILTER_KINDS.map((o) => {
          const on = kindsShown[o.key]
          return (
            <Pressable key={o.key} style={styles.filterOpt} onPress={() => setKind(o.key, !on)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
              <View style={styles.filterOptText}>
                <Text style={styles.filterOptLabel}>{i18n.t(`modalsTask:filter.${o.label}`)}</Text>
                <Text style={styles.hint}>{i18n.t(`modalsTask:filter.${o.sub}`)}</Text>
              </View>
              <View style={[styles.checkbox, on && styles.checkboxOn]}>{on ? <Check size={13} strokeWidth={2.6} color={colors.onBrand} /> : null}</View>
            </Pressable>
          )
        })}
        <Text style={styles.groupHead}>{i18n.t('modalsTask:filter.daysHeading')}</Text>
        <Text style={styles.hint}>{i18n.t('modalsTask:filter.daysSub')}</Text>
        {/* A pressed chip is a day that SHOWS, the polarity web uses. */}
        <View style={[styles.dayChips, flipRow]}>
          {dayNames.map((lbl, d) => {
            const on = !hiddenDays.includes(d)
            return (
              <Pressable key={d} style={[styles.dayChip, on && styles.dayChipOn]} onPress={() => toggleDay(d)} accessibilityState={{ selected: on }}>
                <Text style={[styles.dayChipText, on && styles.dayChipTextOn]}>{lbl}</Text>
              </Pressable>
            )
          })}
        </View>
      </Sheet>

      {/* Duplicates, one pair at a time (web CalendarDuplicateModal). Hiding the
          Google side only hides it here — Google itself is never written to. */}
      <Sheet open={showDuplicates} onClose={() => setShowDuplicates(false)} title={i18n.t('modalsTask:duplicate.title')}>
        <Text style={styles.hint}>{i18n.t('modalsTask:duplicate.intro')}</Text>
        {manualDuplicates.map((d) => (
          <View key={d.id} style={styles.dupCard}>
            <View style={styles.dupHead}>
              <Text style={styles.dupName}>{d.subjectName}</Text>
              <Text style={styles.hint}>{i18n.t('modalsTask:duplicate.when', { day: fmtShortDate(d.when), time: fmtTime(d.when) })}</Text>
            </View>
            <View style={styles.dupRow}>
              <Text style={styles.dupLabel}>{i18n.t('modalsTask:duplicate.rowMeeting', { time: fmtTime(d.meeting.scheduled_at) })}</Text>
              <Pressable style={styles.dupBtn} onPress={() => hideDupMeeting(d)} accessibilityRole="button"><Text style={styles.dupBtnText}>{i18n.t('modalsTask:duplicate.hide')}</Text></Pressable>
            </View>
            <View style={styles.dupRow}>
              <Text style={styles.dupLabel}>{i18n.t('modalsTask:duplicate.rowEvent', { title: d.event.title || i18n.t('modalsTask:duplicate.eventFallback'), time: fmtTime(d.event.start_time) })}</Text>
              <Pressable style={styles.dupBtn} onPress={() => hideDupEvent(d)} accessibilityRole="button"><Text style={styles.dupBtnText}>{i18n.t('modalsTask:duplicate.hide')}</Text></Pressable>
            </View>
            <Text style={styles.hint}>{i18n.t('modalsTask:duplicate.note')}</Text>
          </View>
        ))}
      </Sheet>

      <EventDetailsModal
        open={!!detail}
        event={detail}
        onClose={() => setDetail(null)}
        onConfirmMeeting={handleConfirm}
        onSkipMeeting={(m) => skipMeeting(m)}
        onCancelMeeting={(m) => skipMeeting(m, tr('toast.meetingCanceled'))}
        onDeleteMeeting={(m) => skipMeeting(m, tr('toast.meetingDeleted'))}
        onRescheduleMeeting={rescheduleMeeting}
        onUpdateEvent={updateEvent}
        onDeleteEvent={(ev) => deleteEvent(ev).catch(() => showError(tr('toast.actionFailed')))}
        onCancelBooking={(ev) => cancelBooking(ev.booking, ev.raw).catch(() => showError(i18n.t('components:errors.bookingCancel')))}
        onFollowupDone={clearFollowup}
        onCompleteReminder={completeReminder}
        onRemoveReminder={removeReminder}
        billClient={billClient}
        onBillSession={billSession}
      />
    </Screen>
  )
}

const styles = themed((c, t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, gap: 14 },
  error: { color: c.danger, fontSize: 13 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(212,165,116,0.4)', backgroundColor: 'rgba(212,165,116,0.12)' },
  bannerText: { flex: 1, fontSize: 13, color: c.text },
  bannerCta: { fontSize: 13, fontWeight: '600', color: c.brand },
  empty: { color: c.textFaint, fontSize: 14, textAlign: 'center', marginTop: 12 },

  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  seg: { flexDirection: 'row', padding: 2, borderRadius: 999, backgroundColor: c.cardFlat },
  segBtn: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 999 },
  segOn: { backgroundColor: c.brand },
  segText: { fontSize: 13, color: c.textSub },
  segTextOn: { color: c.onBrand, fontWeight: '600' },
  filterBtn: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: c.border },
  filterText: { fontSize: 12, color: c.textSub },
  filterDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.brand },

  // Grid
  grid: { paddingVertical: 14, paddingHorizontal: 10, gap: 6 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, marginBottom: 4 },
  monthLabel: { fontSize: 15, fontWeight: '600', color: c.text },
  weekHead: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: c.textSub },
  week: { flexDirection: 'row' },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  cellInner: { width: '100%', height: '100%', borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 3 },
  cellSel: { backgroundColor: c.brand },
  cellToday: { backgroundColor: 'rgba(139,168,136,0.10)', borderWidth: 1, borderColor: 'rgba(139,168,136,0.45)' },
  cellNum: { fontSize: 13, color: c.text },
  cellNumSel: { color: c.onBrand, fontWeight: '600' },
  cellNumToday: { color: c.text, fontWeight: '600' },
  dots: { flexDirection: 'row', gap: 2, height: 4 },
  evDot: { width: 4, height: 4, borderRadius: 2 },

  // Rows
  dayLabel: { fontSize: 14, fontWeight: '600', color: c.textSub, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  rowFlip: { flexDirection: 'row-reverse' },
  eventTitleRtl: { textAlign: 'right' },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowWhen: { fontSize: 12, color: c.textSub },
  dot: { width: 8, height: 8, borderRadius: 4 },
  eventTitle: { fontSize: 15, color: c.text },
  kindTag: { fontSize: 11, color: c.textFaint, backgroundColor: c.cardFlat, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  confirm: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(139,168,136,0.4)', alignItems: 'center', justifyContent: 'center' },
  wa: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: c.cardFlat },
  loadMore: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: c.border },
  loadMoreText: { fontSize: 13, color: c.textSub },

  // Sheets
  hint: { fontSize: 12, color: c.textSub, lineHeight: 17 },
  groupHead: { fontSize: 13, fontWeight: '600', color: c.text, marginTop: 4 },
  gateOpt: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  gateIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.cardFlat },
  gateText: { flex: 1, gap: 2 },
  gateName: { fontSize: 15, fontWeight: '600', color: c.text },
  gateHint: { fontSize: 12, color: c.textSub },
  filterOpt: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  filterOptText: { flex: 1, gap: 1 },
  filterOptLabel: { fontSize: 14, color: c.text },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: c.brand, borderColor: c.brand },
  dayChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayChip: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: c.border },
  dayChipOn: { backgroundColor: c.brand, borderColor: c.brand },
  dayChipText: { fontSize: 13, color: c.textSub },
  dayChipTextOn: { color: c.onBrand, fontWeight: '600' },
  dupCard: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: c.cardFlat },
  dupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dupName: { fontSize: 14, fontWeight: '600', color: c.text },
  dupRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dupLabel: { flex: 1, fontSize: 13, color: c.text },
  dupBtn: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: c.border },
  dupBtnText: { fontSize: 12, color: c.textSub },
}))
