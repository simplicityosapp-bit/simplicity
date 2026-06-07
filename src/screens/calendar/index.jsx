import { useMemo, useState } from 'react'
import { remindersUpcoming } from '../../lib/homeData'
import { useReminders } from '../../hooks/useReminders'
import { useScheduledMeetings } from '../../hooks/useScheduledMeetings'
import { useCalendarEvents } from '../../hooks/useCalendarEvents'
import { useClients } from '../../hooks/useClients'
import { useGroups } from '../../hooks/useGroups'
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
import CalendarHeader from './CalendarHeader'
import CalendarSchedule from './CalendarSchedule'
import CalendarDay from './CalendarDay'
import CalendarWeek from './CalendarWeek'
import CalendarMonth from './CalendarMonth'
import Coachmark from '../../components/Coachmark'
import './CalendarScreen.css'

const VALID_VIEWS = new Set(['schedule', 'day', 'week', 'month'])

export default function CalendarScreen() {
  const { reminders, addReminder, completeReminder, removeReminder } = useReminders()
  const { meetings, addMeeting, updateMeeting } = useScheduledMeetings()
  const { events: calendarEvents } = useCalendarEvents()
  const { clients } = useClients()
  const { groups } = useGroups()
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
      if (m.subject_type === 'client') return clients.find((c) => c.id === m.subject_id)?.name || 'לקוח'
      if (m.subject_type === 'group') return groups.find((g) => g.id === m.subject_id)?.name || 'קבוצה'
      return 'אירוע'
    }
    const meetingItems = (meetings || [])
      .filter((m) => ['pending', 'confirmed'].includes(m.status))
      .map((m) => ({
        id: m.id,
        kind: 'meeting',
        title: subjectName(m),
        when: new Date(m.scheduled_at),
        status: m.status,
        raw: m,
      }))
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
        title: ev.title || 'אירוע',
        when: new Date(ev.start_time),
        allDay: !!ev.all_day,
        clientName: ev.client_id ? (clients.find((c) => c.id === ev.client_id)?.name || null) : null,
        projectName: ev.project_id ? (projects.find((p) => p.id === ev.project_id)?.name || null) : null,
        raw: ev,
      }))
    return [...meetingItems, ...reminderItems, ...calendarItems].sort((a, b) => a.when - b.when)
  }, [meetings, reminders, calendarEvents, clients, groups, projects])

  const scheduleItems = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    return allEvents.filter((e) => e.when >= startOfToday).slice(0, 30)
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
              <p className="lbl">{scheduleItems.length} קרובים</p>
              <span className="lbl dot">·</span>
              <p className="lbl">לוח זמנים</p>
            </div>
            <p className="lbl-sm">יום אחרי יום, צעד אחרי צעד.</p>
          </div>
          <p className="t-screen">יומן</p>
        </header>
        <Coachmark id="add-meeting" radius="50%">
          <button className="cta-add" type="button" aria-label="אירוע חדש" onClick={() => setShowGate(true)}>אירוע חדש +</button>
        </Coachmark>
      </div>

      <CalendarHeader
        view={view}
        onViewChange={setView}
        date={date}
        onDateChange={setDate}
        weekStart={weekStart}
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
      />
    </div>
  )
}
