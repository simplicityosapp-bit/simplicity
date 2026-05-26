import { useMemo, useState } from 'react'
import { Clock, CalendarDays } from 'lucide-react'
import { remindersUpcoming } from '../../lib/homeData'
import { formatWhen } from '../../lib/dates'
import { useReminders } from '../../hooks/useReminders'
import { useScheduledMeetings } from '../../hooks/useScheduledMeetings'
import { useClients } from '../../hooks/useClients'
import { useProjects } from '../../hooks/useProjects'
import { useTasks } from '../../hooks/useTasks'
import { useTransactions } from '../../hooks/useTransactions'
import CalendarAddGate from '../../modals/CalendarAddGate'
import ScheduleMeetingModal from '../../modals/ScheduleMeetingModal'
import AddReminderModal from '../../modals/AddReminderModal'
import AddTaskModal from '../../modals/AddTaskModal'
import AddTransactionModal from '../../modals/AddTransactionModal'
import './CalendarScreen.css'

export default function CalendarScreen() {
  const { reminders, addReminder } = useReminders()
  const { meetings, addMeeting } = useScheduledMeetings()
  const { clients } = useClients()
  const { projects } = useProjects()
  const { addTask } = useTasks()
  const { addTransaction } = useTransactions()
  const [showGate, setShowGate] = useState(false)
  const [activeModal, setActiveModal] = useState(null)

  const items = useMemo(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const clientName = (id) => clients.find((c) => c.id === id)?.name || 'לקוח'
    const meetingItems = meetings
      .filter((m) => ['pending', 'confirmed'].includes(m.status) && new Date(m.scheduled_at) >= startOfToday)
      .map((m) => ({ id: m.id, kind: 'meeting', title: clientName(m.subject_id), when: new Date(m.scheduled_at), status: m.status }))
    const reminderItems = remindersUpcoming(now, reminders).map((r) => ({ id: r.id, kind: 'reminder', title: r.title, when: r.when }))
    return [...meetingItems, ...reminderItems].sort((a, b) => a.when - b.when)
  }, [meetings, reminders, clients])

  return (
    <div className="screen">
      <div className="screen-top">
        <header className="screen-head">
          <div>
            <div className="screen-head-meta">
              <p className="lbl">{items.length} קרובים</p>
              <span className="lbl dot">·</span>
              <p className="lbl">לוח זמנים</p>
            </div>
            <p className="lbl-sm">יום אחרי יום, צעד אחרי צעד.</p>
          </div>
          <p className="t-screen">יומן</p>
        </header>
        <button className="cta-add" type="button" aria-label="אירוע חדש" onClick={() => setShowGate(true)}>אירוע חדש +</button>
      </div>

      <p className="cal-section-lbl">אירועים קרובים</p>
      <section className="cal-list">
        {items.length === 0 ? (
          <div className="empty">
            <p className="empty-text">אין אירועים קרובים — לוח נקי.</p>
          </div>
        ) : (
          items.map((it) => (
            <div key={`${it.kind}-${it.id}`} className="cal-item">
              <span className={`cal-icon ${it.kind}`}>
                {it.kind === 'meeting' ? <CalendarDays size={16} strokeWidth={1.6} /> : <Clock size={16} strokeWidth={1.6} />}
              </span>
              <div className="cal-body">
                <p className="cal-title">{it.title}</p>
                <p className="cal-when">{formatWhen(it.when)}</p>
              </div>
              {it.kind === 'meeting' && it.status === 'pending' && <span className="cal-tag">ממתינה</span>}
              {it.kind === 'reminder' && <span className="cal-tag rem">תזכורת</span>}
            </div>
          ))
        )}
      </section>

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
    </div>
  )
}
