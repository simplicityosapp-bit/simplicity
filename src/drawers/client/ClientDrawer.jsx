import { useEffect, useState } from 'react'
import { X, Pencil, Trash2, Check, CalendarPlus, Banknote, ChevronDown } from 'lucide-react'
import { clientBalance, effectiveClientMeta, isGroupDriven } from '../../lib/clients'
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

export default function ClientDrawer({ client, onClose, onDelete, projects = [], txns, tasks, reminders, sessions = [], members = [], groups = [], statuses = [], onLogSession, onScheduleMeeting, onAddPayment, onUpdateClient, onUpdateMember }) {
  const open = !!client
  const [actionModal, setActionModal] = useState(null)
  const [statusMenu, setStatusMenu] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const meta = client ? effectiveClientMeta(client, members, groups) : null
  const groupDriven = isGroupDriven(client, members)
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
                    {groupDriven ? (
                      <span className={`cd-h-status cd-status-${meta}`} title="הסטטוס נקבע אוטומטית לפי הקבוצה">
                        {STATUS[meta] || STATUS.no_status}
                        <span className="cd-h-status-by"> · לפי הקבוצה</span>
                      </span>
                    ) : (
                      <span className="cd-status-pick">
                        <button
                          type="button"
                          className={`cd-h-status cd-status-${meta} is-btn`}
                          aria-haspopup="menu"
                          aria-expanded={statusMenu}
                          onClick={() => setStatusMenu((o) => !o)}
                        >
                          {STATUS[meta] || STATUS.no_status}
                          <ChevronDown size={12} strokeWidth={2} aria-hidden="true" />
                        </button>
                        {statusMenu && (
                          <>
                            <button type="button" className="cd-status-backdrop" aria-hidden="true" tabIndex={-1} onClick={() => setStatusMenu(false)} />
                            <div className="cd-status-menu" role="menu">
                              {Object.entries(STATUS).map(([k, label]) => (
                                <button
                                  key={k}
                                  type="button"
                                  role="menuitemradio"
                                  aria-checked={meta === k}
                                  className={`cd-status-opt${meta === k ? ' on' : ''}`}
                                  onClick={() => { onUpdateClient?.(client.id, { status_meta: k, status_id: null }); setStatusMenu(false) }}
                                >
                                  <span className={`cd-status-dot cd-status-${k}`} aria-hidden="true" />
                                  {label}
                                  {meta === k && <Check size={13} strokeWidth={2} aria-hidden="true" className="cd-status-check" />}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </span>
                    )}
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
        groups={groups}
        statuses={statuses}
        memberships={client ? members.filter((m) => m.client_id === client.id && !m.left_at) : []}
        rawPaid={balance?.paidReal ?? 0}
        memberTotal={balance?.memberTotal ?? 0}
        isMember={isMember}
        onSave={onUpdateClient}
        onUpdateMember={onUpdateMember}
      />
    </>
  )
}
