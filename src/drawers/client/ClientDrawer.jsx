import { useEffect, useState } from 'react'
import { X, Pencil, Trash2, Check, CalendarPlus, Banknote } from 'lucide-react'
import { clientBalance, statusMetaOf } from '../../lib/clients'
import { isr } from '../../lib/finance'
import ClientDrawerSections from './ClientDrawerSections'
import AddSessionModal from '../../modals/AddSessionModal'
import ScheduleMeetingModal from '../../modals/ScheduleMeetingModal'
import AddTransactionModal from '../../modals/AddTransactionModal'
import EditClientModal from '../../modals/EditClientModal'
import './ClientDrawer.css'

const STATUS = {
  active: 'פעיל',
  wandering: 'ביניים',
  past: 'לשעבר',
  no_status: 'ללא סטטוס',
}

const initials = (name) =>
  (name || '').split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase()

export default function ClientDrawer({ client, onClose, onDelete, projects = [], txns, tasks, reminders, sessions = [], members = [], groups = [], statuses = [], onLogSession, onScheduleMeeting, onAddPayment, onUpdateClient }) {
  const open = !!client
  const [actionModal, setActionModal] = useState(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const meta = client ? statusMetaOf(client) : null
  const isPast = meta === 'past'
  const project = client ? projects.find((p) => p.id === client.project_id) : null
  const balance = client ? clientBalance(client, txns, sessions, members, groups) : null
  const isMember = !!client && members.some((m) => m.client_id === client.id && !m.left_at)
  const hasSetup = client && (
    isMember
    || (client.sessions && client.price_per_session)
    || (client.total_override != null && client.total_override !== '')
  )
  const clientSessions = client ? sessions.filter((s) => s.client_id === client.id) : []
  const nextNum = clientSessions.length + 1

  return (
    <>
      <div className={`cd-overlay${open ? ' open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`cd-panel${open ? ' open' : ''}`} aria-label="תיק לקוח" aria-hidden={!open}>
        {client && (
          <>
            <div className="cd-topbar">
              <button type="button" className="cd-top-btn" onClick={onClose} aria-label="סגור">
                <X size={18} strokeWidth={1.6} />
              </button>
              <span className="cd-top-title">תיק לקוח</span>
              <button type="button" className="cd-top-btn danger" title="מחק לקוח" onClick={onDelete}>
                <Trash2 size={17} strokeWidth={1.6} />
              </button>
            </div>

            <div className="cd-scroll">
              <div className="cd-header">
                <div className="cd-h-av">{initials(client.name)}</div>
                <div className="cd-h-id">
                  <p className="cd-h-name">{client.name}</p>
                  <div className="cd-h-sub">
                    <span className={`cd-h-status cd-status-${meta}`}>{STATUS[meta] || STATUS.no_status}</span>
                    {project && <span className="cd-h-proj">· {project.name}</span>}
                  </div>
                </div>
                <button type="button" className="cd-edit-details" onClick={() => setActionModal('edit')}>
                  <Pencil size={13} strokeWidth={1.6} aria-hidden="true" /> ערוך
                </button>
              </div>

              {hasSetup ? (
                <div className="cd-hero">
                  <div className="cd-stat">
                    <p className="cd-stat-l">פגישות</p>
                    <p className="cd-stat-v mono">{balance.sessionsPaid}/{balance.sessionsTotal || 0}</p>
                  </div>
                  <div className="cd-stat divided">
                    <p className="cd-stat-l">שולם</p>
                    <p className="cd-stat-v mono">{isr(balance.paid)}</p>
                  </div>
                  <div className="cd-stat">
                    <p className="cd-stat-l">יתרה</p>
                    <p className="cd-stat-v mono">{isr(balance.balance)}</p>
                  </div>
                </div>
              ) : (
                <p className="cd-hero-hint">הוסף פגישות ומחיר דרך «ערוך»</p>
              )}

              {!isPast && (
                <div className="cd-actions">
                  <button type="button" className="cd-action" onClick={() => setActionModal('session')}>
                    <Check size={15} strokeWidth={1.8} aria-hidden="true" /> תעד פגישה
                  </button>
                  <button type="button" className="cd-action" onClick={() => setActionModal('meeting')}>
                    <CalendarPlus size={15} strokeWidth={1.8} aria-hidden="true" /> תאם פגישה
                  </button>
                  <button type="button" className="cd-action" onClick={() => setActionModal('payment')}>
                    <Banknote size={15} strokeWidth={1.8} aria-hidden="true" /> קיבלתי תשלום
                  </button>
                </div>
              )}

              <ClientDrawerSections client={client} txns={txns} tasks={tasks} reminders={reminders} sessions={sessions} members={members} groups={groups} />
            </div>
          </>
        )}
      </aside>

      <AddSessionModal
        open={actionModal === 'session'}
        onClose={() => setActionModal(null)}
        client={client}
        nextNum={nextNum}
        onSave={(data) => onLogSession?.({
          ...data,
          client_id: client.id,
          group_id: null,
          subject_type: 'client',
          subject_id: client.id,
          num: nextNum,
        })}
      />
      <ScheduleMeetingModal
        open={actionModal === 'meeting'}
        onClose={() => setActionModal(null)}
        client={client}
        onSave={onScheduleMeeting}
      />
      <AddTransactionModal
        key={`pay-${client?.id}`}
        open={actionModal === 'payment'}
        onClose={() => setActionModal(null)}
        client={client}
        projects={projects}
        defaultType="income"
        onSave={onAddPayment}
      />
      <EditClientModal
        key={client?.id}
        open={actionModal === 'edit'}
        onClose={() => setActionModal(null)}
        client={client}
        projects={projects}
        statuses={statuses}
        onSave={onUpdateClient}
      />
    </>
  )
}
