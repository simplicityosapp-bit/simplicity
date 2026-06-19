import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { remindersUpcoming } from '../../lib/homeData'
import { useReminders } from '../../hooks/useReminders'
import { useScheduledMeetings } from '../../hooks/useScheduledMeetings'
import { useScheduledMeetingsGeneration } from '../../hooks/useScheduledMeetingsGeneration'
import { useCalendarDuplicates } from '../../hooks/useCalendarDuplicates'
import { useCalendarEvents } from '../../hooks/useCalendarEvents'
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

export default function CalendarScreen() {
  const { t } = useT('calendar')
  const { reminders, addReminder, completeReminder, removeReminder } = useReminders()
  const { meetings, loading: meetingsLoading, addMeeting, updateMeeting } = useScheduledMeetings()
  const { events: calendarEvents, dismissEvent, updateEvent, deleteEvent } = useCalendarEvents()
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
        return {
          id: m.id,
          kind: 'meeting',
          title: subjectName(m),
          when,
          end: subjectEnd(m, when),
          status: m.status,
          raw: m,
        }
      })
    /* Pull a wider reminder horizon for the grid views, with no
       cap on count (the widget default of 5 wouldn't fill a month). */
    const reminderItems = remindersUpcoming(new Date(), reminders, 365, 0).map((r) => ({
      id: r.id,
      kind: 'reminder',
      title: r.title,
      when: r.when,
      raw: r,
    }))
    /* Synced Google Calendar events — read-only, identified to a client
       where the fuzzy match (or a manual assignment) found one. */
    const calendarItems = (calendarEvents || [])
      .filter((ev) => ev.start_time)
      .map((ev) => ({
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
        raw: ev,
      }))
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
      }))
    const byKind = { meeting: fMeeting, reminder: fReminder, calendar: fCalendar, leadFollowup: fLeadFollowup }
    return [...meetingItems, ...reminderItems, ...calendarItems, ...leadFollowupItems]
      .filter((e) => byKind[e.kind] !== false)
      .sort((a, b) => a.when - b.when)
  }, [meetings, reminders, calendarEvents, clients, groups, leads, projects, fMeeting, fReminder, fCalendar, fLeadFollowup, t])

  const scheduleItems = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    /* Full upcoming list — the dedicated agenda screen paginates with a
       "טען עוד" inside CalendarSchedule (no silent 30-item truncation). */
    return allEvents.filter((e) => e.when >= startOfToday)
  }, [allEvents])

  /* Event action handlers — passed into EventDetailsModal so it
     stays purely declarative. */
  const confirmMeeting = (ev) => updateMeeting(ev.id, { status: 'confirmed' }).catch(() => {})
  const skipMeeting = (ev) => updateMeeting(ev.id, { status: 'skipped' }).catch(() => {})
  const completeReminderHandler = (ev) => completeReminder(ev.id)
  const removeReminderHandler = (ev) => removeReminder(ev.id)

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
          <button className="cta-add" type="button" aria-label={t('newEventAria')} onClick={() => setShowGate(true)}>{t('newEvent')}</button>
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
        />
      )}
      {view === 'month' && (
        <CalendarMonth
          date={date}
          events={allEvents}
          weekStart={weekStart}
          onPickDay={(d) => { setDate(d); setView('day') }}
        />
      )}

      <CalendarAddGate open={showGate} onClose={() => setShowGate(false)} onPick={setActiveModal} />
      <ScheduleMeetingModal
        open={activeModal === 'meeting'}
        onClose={() => setActiveModal(null)}
        clients={clients}
        onSave={addMeeting}
      />
      <AddReminderModal
        open={activeModal === 'reminder'}
        onClose={() => setActiveModal(null)}
        clients={clients}
        onSave={addReminder}
      />
      <AddTaskModal
        open={activeModal === 'task'}
        onClose={() => setActiveModal(null)}
        projects={projects}
        clients={clients}
        onSave={addTask}
      />
      <AddTransactionModal
        open={activeModal === 'transaction'}
        onClose={() => setActiveModal(null)}
        clients={clients}
        projects={projects}
        onSave={addTransaction}
      />
      <EventDetailsModal
        key={selectedEvent?.id}
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        event={selectedEvent}
        onConfirmMeeting={confirmMeeting}
        onSkipMeeting={skipMeeting}
        onCompleteReminder={completeReminderHandler}
        onRemoveReminder={removeReminderHandler}
        onUpdateEvent={updateEvent}
        onDeleteEvent={deleteEvent}
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
