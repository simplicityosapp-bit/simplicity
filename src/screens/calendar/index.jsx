import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { remindersUpcoming } from '../../lib/homeData'
import { fmtShortDate, fmtTime } from '../../lib/dates'
import { useReminders } from '../../hooks/useReminders'
import { useScheduledMeetings } from '../../hooks/useScheduledMeetings'
import { useSessions } from '../../hooks/useSessions'
import { useScheduledMeetingsGeneration } from '../../hooks/useScheduledMeetingsGeneration'
import { confirmScheduledMeeting, skipScheduledMeeting } from '../../lib/scheduledMeetings'
import { useCalendarDuplicates } from '../../hooks/useCalendarDuplicates'
import { useCalendarEvents } from '../../hooks/useCalendarEvents'
import { useBookings } from '../../hooks/useBookings'
import { useBookingPages } from '../../hooks/useBookingPages'
import { useMeetingTypes } from '../../hooks/useMeetingTypes'
import { useClients } from '../../hooks/useClients'
import { useGroups } from '../../hooks/useGroups'
import { useLeads } from '../../hooks/useLeads'
import { useProjects } from '../../hooks/useProjects'
import { useTasks } from '../../hooks/useTasks'
import { useTransactions } from '../../hooks/useTransactions'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import CalendarAddGate from '../../modals/CalendarAddGate'
import ScheduleMeetingModal from '../../modals/ScheduleMeetingModal'
import AddReminderModal from '../../modals/AddReminderModal'
import AddTaskModal from '../../modals/AddTaskModal'
import AddTransactionModal from '../../modals/AddTransactionModal'
import EventDetailsModal from '../../modals/EventDetailsModal'
import CalendarDuplicateModal from '../../modals/CalendarDuplicateModal'
import CalendarFilterModal from '../../modals/CalendarFilterModal'
import CalendarHeader from './CalendarHeader'
import CalendarSchedule from './CalendarSchedule'
import CalendarDay from './CalendarDay'
import CalendarWeek from './CalendarWeek'
import CalendarMonth from './CalendarMonth'
import Coachmark from '../../components/Coachmark'
import { useT } from '../../i18n/useT'
import './CalendarScreen.css'

const VALID_VIEWS = new Set(['schedule', 'day', 'week', 'month'])
/* Local (not UTC) Y-M-D / H:M for prefilling the schedule modal from a tapped
   slot — toISOString() would shift the day/hour across the timezone offset. */
const pad2 = (n) => String(n).padStart(2, '0')
const localDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const localTimeStr = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`

export default function CalendarScreen() {
  const { t } = useT('calendar')
  const { reminders, addReminder, completeReminder, removeReminder } = useReminders()
  const { meetings, loading: meetingsLoading, addMeeting, updateMeeting } = useScheduledMeetings()
  const { sessions, addSession, removeSession } = useSessions()
  const { events: calendarEvents, dismissEvent, updateEvent, deleteEvent } = useCalendarEvents()
  const { bookings, cancel: cancelBookingFn } = useBookings()
  const { pages: bookingPages } = useBookingPages()
  const { types: meetingTypes } = useMeetingTypes()
  const { clients } = useClients()
  const { groups } = useGroups()

  /* Materialize recurring client/group meetings (recurring_day + recurring_time)
     into scheduled_meetings while the calendar is open. Without this the engine
     only runs on the home screen (AttentionWidget), so a freshly-set "שעה קבועה"
     wouldn't appear here until the user happened to visit home. Idempotent. */
  useScheduledMeetingsGeneration({ clients, groups, meetings, meetingsLoading, addMeeting })
  const { leads, updateLead } = useLeads()
  const { projects } = useProjects()
  const { addTask } = useTasks()
  const { addTransaction } = useTransactions()
  const { prefs, update: updatePrefs } = useUserPreferences()

  const initialView = VALID_VIEWS.has(prefs?.calendarDefaultView) ? prefs.calendarDefaultView : 'schedule'
  const [view, setViewState] = useState(initialView)
  const [date, setDate] = useState(() => new Date())
  const [showGate, setShowGate] = useState(false)
  const [activeModal, setActiveModal] = useState(null)
  /* When a meeting is started by tapping an empty day-grid slot, this holds
     the tapped Date so the modal opens prefilled with that day + hour. */
  const [scheduleAt, setScheduleAt] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [showFilter, setShowFilter] = useState(false)

  /* Calendar view filter — toggles which event TYPES appear (persisted in
     prefs.calendarFilter; absent key = shown). Mirrors the prototype's
     "פילטר תצוגה", scoped to the event kinds the app actually renders. */
  const fMeeting = prefs?.calendarFilter?.meeting !== false
  const fReminder = prefs?.calendarFilter?.reminder !== false
  const fCalendar = prefs?.calendarFilter?.calendar !== false
  const fLeadFollowup = prefs?.calendarFilter?.leadFollowup !== false
  const filterActive = !(fMeeting && fReminder && fCalendar && fLeadFollowup)
  const setCalFilter = (key, value) =>
    updatePrefs?.({ calendarFilter: { meeting: fMeeting, reminder: fReminder, calendar: fCalendar, leadFollowup: fLeadFollowup, [key]: value } })

  /* Mark a lead's follow-up as done from the calendar — clears the date so
     the event drops off (the lead itself stays in its column). */
  const markFollowupDone = (ev) => updateLead(ev.raw.id, { follow_up_date: null }).catch(() => {})

  /* Calendar duplicates: an app recurring meeting that collides with a synced
     Google event for the same subject/day/time. Surfaced as a banner here +
     a row in the home AttentionWidget; resolved one-by-one (never auto). */
  const { duplicates, hideMeeting, hideEvent } = useCalendarDuplicates({
    meetings, calendarEvents, clients, groups, updateMeeting, dismissEvent,
  })

  const weekStart = prefs?.format?.week_start || prefs?.weekStart || 'sunday'
  const dayViewStart = Number.isFinite(prefs?.dayViewStart) ? prefs.dayViewStart : 6
  const dayViewEnd = Number.isFinite(prefs?.dayViewEnd) ? prefs.dayViewEnd : 22
  /* Hebrew-calendar display mode (Settings → Appearance). `dual` shows the
     Gregorian date alongside; it only matters while `hebrew` is on. */
  const hebrew = !!prefs?.design?.hebrew_calendar
  const hebrewDual = hebrew && !!prefs?.design?.hebrew_calendar_dual

  /* Persist the view choice so the next visit opens in the same
     mode. updatePrefs may be a no-op stub on the auth screen. */
  const setView = (v) => {
    setViewState(v)
    updatePrefs?.({ calendarDefaultView: v })
  }

  /* Unified event feed: scheduled_meetings + reminder expansions.
     Schedule view limits to "today onward" the way the original
     code did, so the upcoming list isn't padded with past meetings.
     The grid views (day/week/month) get the full feed so they can
     render any selected period. */
  const allEvents = useMemo(() => {
    const subjectName = (m) => {
      if (m.subject_type === 'client') return clients.find((c) => c.id === m.subject_id)?.name || t('fallback.client')
      if (m.subject_type === 'group') return groups.find((g) => g.id === m.subject_id)?.name || t('fallback.group')
      return t('fallback.event')
    }
    /* End time for a recurring meeting comes from the subject's
       recurring_end_time (clients + groups both carry it) applied to the
       meeting's own date — lets the day timeline span the real duration
       instead of falling back to a fixed block. */
    const subjectEnd = (m, start) => {
      const subj = m.subject_type === 'group'
        ? groups.find((g) => g.id === m.subject_id)
        : clients.find((c) => c.id === m.subject_id)
      const hhmm = subj?.recurring_end_time && String(subj.recurring_end_time).match(/^(\d{1,2}):(\d{2})/)
      if (!hhmm) return null
      const end = new Date(start)
      end.setHours(Number(hhmm[1]), Number(hhmm[2]), 0, 0)
      return end > start ? end : null
    }
    const meetingItems = (meetings || [])
      .filter((m) => ['pending', 'confirmed'].includes(m.status))
      .map((m) => {
        const when = new Date(m.scheduled_at)
        /* Only 1-on-1 (client) meetings can be reminded over WhatsApp —
           a group meeting has no single recipient number. */
        const client = m.subject_type === 'client' ? clients.find((c) => c.id === m.subject_id) : null
        return {
          id: m.id,
          kind: 'meeting',
          title: subjectName(m),
          when,
          end: subjectEnd(m, when),
          status: m.status,
          raw: m,
          whatsapp: client
            ? { phone: client.phone, key: 'meeting', vars: { name: client.name, date: fmtShortDate(when), time: fmtTime(when) } }
            : null,
        }
      })
    /* Pull a wider reminder horizon for the grid views, with no
       cap on count (the widget default of 5 wouldn't fill a month). */
    const reminderItems = remindersUpcoming(new Date(), reminders, 365, 0).map((r) => {
      /* A reminder may be linked to a client; if so we can prefill their
         number. Otherwise the button still works (WhatsApp picker). */
      const client = r.linked_to_type === 'client' ? clients.find((c) => c.id === r.linked_to_id) : null
      return {
        id: r.id,
        kind: 'reminder',
        title: r.title,
        when: r.when,
        raw: r,
        whatsapp: { phone: client?.phone || '', key: client?.name ? 'reminder' : 'reminderNoName', vars: { name: client?.name, title: r.title } },
      }
    })
    /* Owned events created from a booking carry the booking context (who +
       which page + what they filled). The booking points back at its event
       via event_id, so match on that — no extra column needed. */
    const bookingByEvent = new Map((bookings || []).filter((b) => b.event_id).map((b) => [b.event_id, b]))
    /* Synced Google Calendar events — read-only, identified to a client
       where the fuzzy match (or a manual assignment) found one. */
    const calendarItems = (calendarEvents || [])
      .filter((ev) => ev.start_time)
      .map((ev) => {
        const bk = bookingByEvent.get(ev.id)
        const booking = bk ? {
          id: bk.id,
          event_id: bk.event_id,
          name: bk.name,
          phone: bk.phone || null,
          email: bk.email || null,
          note: bk.note || null,
          pageName: (bookingPages || []).find((p) => p.id === bk.page_id)?.title?.trim() || 'דף קביעת פגישות',
          meetingTypeName: bk.meeting_type_id ? ((meetingTypes || []).find((mt) => mt.id === bk.meeting_type_id)?.name || null) : null,
        } : null
        return {
          id: ev.id,
          kind: 'calendar',
          title: ev.title || t('fallback.event'),
          when: new Date(ev.start_time),
          end: ev.end_time ? new Date(ev.end_time) : null,
          allDay: !!ev.all_day,
          clientName: ev.client_id ? (clients.find((c) => c.id === ev.client_id)?.name || null) : null,
          projectName: ev.project_id ? (projects.find((p) => p.id === ev.project_id)?.name || null) : null,
          leadName: ev.lead_id ? (leads.find((l) => l.id === ev.lead_id)?.name || null) : null,
          groupName: ev.group_id ? (groups.find((g) => g.id === ev.group_id)?.name || null) : null,
          booking,
          raw: ev,
        }
      })
    /* Lead follow-ups — a soft follow_up_date on an active (in_process) lead,
       shown at 09:00 that day. Closed leads (converted/irrelevant/ghost)
       drop off. Tapping opens the lead-followup detail (mark done). */
    const leadFollowupItems = (leads || [])
      .filter((l) => !l.deleted_at && l.follow_up_date && l.status_meta === 'in_process')
      .map((l) => ({
        id: `lead-fu-${l.id}`,
        kind: 'leadFollowup',
        title: l.name || t('fallback.lead'),
        when: new Date(`${String(l.follow_up_date).slice(0, 10)}T09:00:00`),
        raw: l,
        whatsapp: { phone: l.phone || '', key: 'lead', vars: { name: l.name } },
      }))
    const byKind = { meeting: fMeeting, reminder: fReminder, calendar: fCalendar, leadFollowup: fLeadFollowup }
    return [...meetingItems, ...reminderItems, ...calendarItems, ...leadFollowupItems]
      .filter((e) => byKind[e.kind] !== false)
      .sort((a, b) => a.when - b.when)
  }, [meetings, reminders, calendarEvents, bookings, bookingPages, meetingTypes, clients, groups, leads, projects, fMeeting, fReminder, fCalendar, fLeadFollowup, t])

  const scheduleItems = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    /* Full upcoming list — the dedicated agenda screen paginates with a
       "טען עוד" inside CalendarSchedule (no silent 30-item truncation). */
    return allEvents.filter((e) => e.when >= startOfToday)
  }, [allEvents])

  /* Event action handlers — passed into EventDetailsModal so it
     stays purely declarative. */
  /* "Did it happen? → yes" mirrors the home review widget: materialise + link a
     session so the meeting lands on the client/group card and counts toward
     sessions. Per-session clients are the exception — they log their session
     through the one-off charge prompt (billSession) below, so auto-materialising
     here too would double-count; for them we just flip the status. */
  const confirmMeeting = (ev) => {
    const m = ev.raw
    const c = m?.subject_type === 'client' ? clients.find((x) => x.id === m.subject_id) : null
    if (c?.billing_mode === 'per_session') return updateMeeting(m.id, { status: 'confirmed' }).catch(() => {})
    return confirmScheduledMeeting({ meeting: m, sessions, addSession, updateMeeting })
  }
  const skipMeeting = (ev) => skipScheduledMeeting({ meeting: ev.raw, updateMeeting, removeSession })

  /* "Did the meeting happen?" for a per-session client → offer a one-off charge.
     Billing a per-session client = logging the meeting as a held session
     (clientBalance accrues held × price_per_session). Only surfaced for a
     meeting whose subject is a per-session client. */
  const meetingClientFor = (ev) =>
    ev?.kind === 'meeting' && ev.raw?.subject_type === 'client'
      ? clients.find((c) => c.id === ev.raw.subject_id)
      : null
  const billClient = (() => {
    const c = meetingClientFor(selectedEvent)
    return c && c.billing_mode === 'per_session' ? c : null
  })()
  const billSession = (ev) => {
    const c = meetingClientFor(ev)
    if (!c) return Promise.resolve()
    const num = sessions.filter((s) => !s.deleted_at && s.client_id === c.id).length + 1
    return addSession({
      date: new Date(ev.when).toISOString(),
      summary: null,
      notes: null,
      client_id: c.id,
      group_id: null,
      subject_type: 'client',
      subject_id: c.id,
      num,
    }).catch(() => {})
  }
  const completeReminderHandler = (ev) => completeReminder(ev.id)
  const removeReminderHandler = (ev) => removeReminder(ev.id)

  /* Cancel a confirmed booking from its calendar event: drop the Google event
     + free the slot (cancelBookingFn), then remove the owned event from the
     calendar (cache-aware deleteEvent), and close the detail. */
  const cancelBookingHandler = async (ev) => {
    if (!ev?.booking?.id) return
    try {
      await cancelBookingFn(ev.booking)
      await deleteEvent(ev.id)
    } catch { /* surfaced via toast in the hook */ }
    setSelectedEvent(null)
  }

  return (
    <div className="screen">
      <div className="screen-top">
        <header className="screen-head">
          <div>
            <div className="screen-head-meta">
              <p className="lbl">{t('upcomingCount', { count: scheduleItems.length })}</p>
              <span className="lbl dot">·</span>
              <p className="lbl">{t('schedule')}</p>
            </div>
            <p className="lbl-sm">{t('tagline')}</p>
          </div>
          <p className="t-screen">{t('title')}</p>
        </header>
        <Coachmark id="add-meeting" radius="50%">
          <button className="cta-add" type="button" aria-label={t('newEventAria')} onClick={() => { setScheduleAt(null); setShowGate(true) }}>{t('newEvent')}</button>
        </Coachmark>
      </div>

      {duplicates.length > 0 && (
        <button type="button" className="cal-dup-banner" onClick={() => setShowDuplicates(true)}>
          <AlertTriangle size={15} strokeWidth={1.8} aria-hidden="true" />
          <span className="cal-dup-text">
            {duplicates.length === 1
              ? t('dup.one')
              : t('dup.many', { count: duplicates.length })}
          </span>
          <span className="cal-dup-cta">{t('dup.cta')} <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" /></span>
        </button>
      )}

      <CalendarHeader
        view={view}
        onViewChange={setView}
        date={date}
        onDateChange={setDate}
        weekStart={weekStart}
        hebrew={hebrew}
        dual={hebrewDual}
        onOpenFilter={() => setShowFilter(true)}
        filterActive={filterActive}
      />

      {view === 'schedule' && (
        <CalendarSchedule items={scheduleItems} onSelect={setSelectedEvent} />
      )}
      {view === 'day' && (
        <CalendarDay
          date={date}
          events={allEvents}
          onSelect={setSelectedEvent}
          onPickSlot={(d) => { setScheduleAt(d); setShowGate(true) }}
          dayViewStart={dayViewStart}
          dayViewEnd={dayViewEnd}
        />
      )}
      {view === 'week' && (
        <CalendarWeek
          date={date}
          events={allEvents}
          onSelect={setSelectedEvent}
          onPickDay={(d) => { setDate(d); setView('day') }}
          weekStart={weekStart}
          hebrew={hebrew}
          dual={hebrewDual}
        />
      )}
      {view === 'month' && (
        <CalendarMonth
          date={date}
          events={allEvents}
          weekStart={weekStart}
          hebrew={hebrew}
          dual={hebrewDual}
          onPickDay={(d) => { setDate(d); setView('day') }}
        />
      )}

      <CalendarAddGate open={showGate} onClose={() => setShowGate(false)} onPick={setActiveModal} />
      <ScheduleMeetingModal
        key={scheduleAt ? scheduleAt.getTime() : 'new'}
        open={activeModal === 'meeting'}
        onClose={() => { setActiveModal(null); setScheduleAt(null) }}
        clients={clients}
        onSave={addMeeting}
        initialDate={scheduleAt ? localDateStr(scheduleAt) : undefined}
        initialTime={scheduleAt ? localTimeStr(scheduleAt) : undefined}
      />
      <AddReminderModal
        key={scheduleAt ? `r-${scheduleAt.getTime()}` : 'r-new'}
        open={activeModal === 'reminder'}
        onClose={() => { setActiveModal(null); setScheduleAt(null) }}
        clients={clients}
        onSave={addReminder}
        initialDate={scheduleAt ? localDateStr(scheduleAt) : undefined}
        initialTime={scheduleAt ? localTimeStr(scheduleAt) : undefined}
      />
      <AddTaskModal
        open={activeModal === 'task'}
        onClose={() => { setActiveModal(null); setScheduleAt(null) }}
        projects={projects}
        clients={clients}
        onSave={addTask}
      />
      <AddTransactionModal
        open={activeModal === 'transaction'}
        onClose={() => { setActiveModal(null); setScheduleAt(null) }}
        clients={clients}
        projects={projects}
        onSave={addTransaction}
      />
      <EventDetailsModal
        key={selectedEvent?.id}
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        event={selectedEvent}
        billClient={billClient}
        onConfirmMeeting={confirmMeeting}
        onSkipMeeting={skipMeeting}
        onBillSession={billSession}
        onCompleteReminder={completeReminderHandler}
        onRemoveReminder={removeReminderHandler}
        onUpdateEvent={updateEvent}
        onDeleteEvent={deleteEvent}
        onCancelBooking={cancelBookingHandler}
        onFollowupDone={markFollowupDone}
      />
      <CalendarDuplicateModal
        open={showDuplicates}
        onClose={() => setShowDuplicates(false)}
        duplicates={duplicates}
        onHideMeeting={hideMeeting}
        onHideEvent={hideEvent}
      />
      <CalendarFilterModal
        open={showFilter}
        onClose={() => setShowFilter(false)}
        filter={{ meeting: fMeeting, reminder: fReminder, calendar: fCalendar, leadFollowup: fLeadFollowup }}
        onChange={setCalFilter}
      />
    </div>
  )
}
