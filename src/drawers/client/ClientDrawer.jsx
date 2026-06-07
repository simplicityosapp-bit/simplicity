import { useEffect, useRef, useState } from 'react'
import { X, Pencil, Trash2, Check, CalendarPlus, Banknote, ChevronDown } from 'lucide-react'
import { clientBalance, effectiveClientMeta, isGroupDriven } from '../../lib/clients'
import { isr } from '../../lib/finance'
import ClientDrawerSections from './ClientDrawerSections'
import AddSessionModal from '../../modals/AddSessionModal'
import ScheduleMeetingModal from '../../modals/ScheduleMeetingModal'
import AddTransactionModal from '../../modals/AddTransactionModal'
import EditClientModal from '../../modals/EditClientModal'
import EditTransactionModal from '../../modals/EditTransactionModal'
import ConfirmModal from '../../modals/ConfirmModal'
import { pushUndo } from '../../lib/undo'
import './ClientDrawer.css'

const STATUS = {
  active: 'פעיל',
  wandering: 'ביניים',
  past: 'לשעבר',
  no_status: 'ללא סטטוס',
}

const initials = (name) =>
  (name || '').split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase()

export default function ClientDrawer({ client, onClose, onDelete, projects = [], txns, tasks, reminders, sessions = [], members = [], groups = [], statuses = [], categories = [], onLogSession, onScheduleMeeting, onAddPayment, onUpdateClient, onUpdateMember, onEditTransaction }) {
  const open = !!client
  const [actionModal, setActionModal] = useState(null)
  /* A transaction picked for editing from the payments panel. */
  const [editTx, setEditTx] = useState(null)
  const [statusMenu, setStatusMenu] = useState(false)
  /* Manual "שולם" edit flow: pendingPayment holds the delta awaiting the
     "record a transaction?" prompt; paymentAmount pre-fills the payment modal. */
  const [pendingPayment, setPendingPayment] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState(null)
  /* True while "הוסף תנועה" is handling the prompt, so the shared onClose
     doesn't ALSO record an informal credit. */
  const paidActionRef = useRef(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  /* Change the client's status with a one-step undo (restores the prior
     status_meta + status_id). No-op if the status didn't actually change. */
  const changeStatus = (k) => {
    if (!client || client.status_meta === k) { setStatusMenu(false); return }
    const prev = { status_meta: client.status_meta ?? null, status_id: client.status_id ?? null }
    const next = { status_meta: k, status_id: null }
    onUpdateClient?.(client.id, next)
    setStatusMenu(false)
    pushUndo({
      label: 'הסטטוס שונה',
      undo: async () => { await onUpdateClient?.(client.id, prev) },
      redo: async () => { await onUpdateClient?.(client.id, next) },
    })
  }

  const meta = client ? effectiveClientMeta(client, members, groups) : null
  const groupDriven = isGroupDriven(client, members)
  const project = client ? projects.find((p) => p.id === client.project_id) : null
  const balance = client ? clientBalance(client, txns, sessions, members, groups) : null
  const isMember = !!client && members.some((m) => m.client_id === client.id && !m.left_at)
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
                                  onClick={() => changeStatus(k)}
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

              {/* Billing hero — ALWAYS shown on every client card (global).
                 "פגישות" = PERSONAL (done/set) when the client has 1-on-1
                 sessions; otherwise it summarises the group(s). */}
              <div className="cd-hero">
                <div className="cd-stat">
                  <p className="cd-stat-l">פגישות</p>
                  <p className="cd-stat-v mono">
                    {balance.hasPersonal
                      ? (balance.perSession
                        /* Per-session billing (migration 0014) — no preset
                           quota, so only the held count is meaningful. */
                        ? `${balance.personalDone}`
                        : `${balance.personalDone}/${balance.personalQuota || 0}`)
                      : `${balance.groupSessions.filter((g) => !g.ended).reduce((s, g) => s + g.held, 0)}/${balance.groupSessions.filter((g) => !g.ended).reduce((s, g) => s + (g.quota || 0), 0) || 0}`}
                  </p>
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

              {/* Per-session billing note — names the model so the growing
                 balance after each logged meeting is self-explanatory. */}
              {balance.perSession && (
                <p className="cd-billmode">חיוב לפי פגישה · {isr(client.price_per_session || 0)} לפגישה</p>
              )}

              {/* Group sessions — read-only breakdown, one row per group.
                 The full profile shows these in addition to the personal
                 count above (the compact list card shows personal only). */}
              {balance.groupSessions.length > 0 && (
                <div className="cd-grp-sessions">
                  {balance.groupSessions.map((gs) => (
                    <div key={gs.id} className="cd-grp-row">
                      <span className="cd-grp-name">פגישות · {gs.name}{gs.ended ? ' (הסתיימה)' : ''}</span>
                      <span className="cd-grp-val mono">{gs.held}/{gs.quota || 0}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick actions — ALWAYS shown on every client card (global). */}
              <div className="cd-actions">
                <button type="button" className="cd-action" onClick={() => setActionModal('session')}>
                  <Check size={15} strokeWidth={1.8} aria-hidden="true" /> תעד פגישה
                </button>
                <button type="button" className="cd-action" onClick={() => setActionModal('meeting')}>
                  <CalendarPlus size={15} strokeWidth={1.8} aria-hidden="true" /> תאם פגישה
                </button>
                <button type="button" className="cd-action" onClick={() => { setPaymentAmount(null); setActionModal('payment') }}>
                  <Banknote size={15} strokeWidth={1.8} aria-hidden="true" /> קיבלתי תשלום
                </button>
              </div>

              <ClientDrawerSections client={client} txns={txns} tasks={tasks} reminders={reminders} sessions={sessions} members={members} groups={groups} onEditTx={setEditTx} onEditClient={() => setActionModal('edit')} />
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
        key={`pay-${client?.id}-${paymentAmount ?? 'x'}`}
        open={actionModal === 'payment'}
        onClose={() => { setActionModal(null); setPaymentAmount(null) }}
        client={client}
        projects={projects}
        defaultType="income"
        defaults={paymentAmount != null ? { amount: String(Math.abs(paymentAmount)), desc: 'עדכון תשלום' } : {}}
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
        personalHeld={balance?.personalHeld ?? 0}
        groupSessions={balance?.groupSessions ?? []}
        isMember={isMember}
        onSave={onUpdateClient}
        onUpdateMember={onUpdateMember}
        onPaidEntry={(delta) => setPendingPayment(delta)}
      />

      {/* Edit an existing payment/transaction from the payments panel. */}
      <EditTransactionModal
        key={editTx?.id}
        open={!!editTx}
        onClose={() => setEditTx(null)}
        tx={editTx}
        clients={client ? [client] : []}
        projects={projects}
        categories={categories}
        onSave={onEditTransaction}
      />

      {/* Manual "שולם" edit → record a real transaction, or just fix the card. */}
      <ConfirmModal
        open={pendingPayment != null}
        onClose={() => {
          /* "התעלם" (or dismiss) → keep the change ON THE CARD only: store
             the delta as an informal paid_adjustment, no finance entry. */
          if (!paidActionRef.current && pendingPayment != null && client) {
            onUpdateClient?.(client.id, { paid_adjustment: (Number(client.paid_adjustment) || 0) + pendingPayment })
          }
          paidActionRef.current = false
          setPendingPayment(null)
        }}
        title="עדכון תשלום ידני"
        message={pendingPayment != null
          ? `עדכנת את «שולם» ב-${isr(Math.abs(pendingPayment))}. להוסיף תנועה רשמית בכספים, או רק לעדכן את כרטיס הלקוח (בלי תנועה)?`
          : ''}
        confirmLabel="הוסף תנועה"
        cancelLabel="רק בכרטיס"
        onConfirm={() => { paidActionRef.current = true; setPaymentAmount(pendingPayment); setActionModal('payment') }}
      />
    </>
  )
}
