import { useEffect, useRef, useState } from 'react'
import { X, Pencil, Trash2, Check, CalendarPlus, Banknote, ChevronDown, RotateCcw } from 'lucide-react'
import { clientBalance, effectiveClientMeta, isGroupDriven, isStatusOverridden, planInstallments, planBalance, isr } from '@simplicity/core'
import { usePaymentPlans } from '../../hooks/usePaymentPlans'
import MG from '../../components/MG'
import ClientDrawerSections from './ClientDrawerSections'
import WhatsAppButton from '../../components/WhatsAppButton'
import GrowPayButton from '../../components/GrowPayButton'
import { useWhatsAppMessage } from '../../hooks/useWhatsAppMessage'
import AddSessionModal from '../../modals/AddSessionModal'
import AddTaskModal from '../../modals/AddTaskModal'
import AddReminderModal from '../../modals/AddReminderModal'
import ScheduleMeetingModal from '../../modals/ScheduleMeetingModal'
import AddTransactionModal from '../../modals/AddTransactionModal'
import EditClientModal from '../../modals/EditClientModal'
import EditTransactionModal from '../../modals/EditTransactionModal'
import AdjustmentModal from '../../modals/AdjustmentModal'
import { useClientAdjustments } from '../../hooks/useClientAdjustments'
import { pushUndo } from '../../lib/undo'
import { useT } from '../../i18n/useT'
import './ClientDrawer.css'
import { Box, Txt, Btn } from '../../components/ui'

const STATUS_KEY = {
  active: 'status.active',
  wandering: 'status.wandering',
  past: 'status.past',
  no_status: 'status.noStatus',
}

const initials = (name) =>
  (name || '').split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase()

export default function ClientDrawer({ client, onClose, onDelete, projects = [], txns, tasks, reminders, sessions = [], members = [], groups = [], statuses = [], categories = [], clients = [], onLogSession, onScheduleMeeting, onAddPayment, onUpdateClient, onUpdateMember, onEditTransaction, onRemoveTransaction, onEditSession, onEditTask, onEditReminder, onIssued }) {
  const { t } = useT('clients')
  const waMsg = useWhatsAppMessage()
  const open = !!client
  const [actionModal, setActionModal] = useState(null)
  /* A transaction picked for editing from the payments panel. */
  const [editTx, setEditTx] = useState(null)
  /* Items picked for editing from their panels (session / task / reminder). */
  const [editSession, setEditSession] = useState(null)
  const [editTask, setEditTask] = useState(null)
  const [editReminder, setEditReminder] = useState(null)
  const [statusMenu, setStatusMenu] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState(null)
  /* Editing «שולם» or «יתרה» by hand no longer raises a bare yes/no prompt.
     The delta opens the adjustment sheet instead, pre-seeded with the amount
     and a likely reason, so every adjustment lands in the ledger with a
     reason and a date attached (migration 0095). */
  const [pendingAdjust, setPendingAdjust] = useState(null)
  const { adjustments, addAdjustment } = useClientAdjustments()
  const scrollRef = useRef(null)

  const clientAdjustments = client ? adjustments.filter((a) => a.client_id === client.id) : []

  const recordAdjustment = async ({ kind, reason, amount, note }) => {
    if (!client) return
    await addAdjustment(client, {
      kind, reason, amount, note,
      undoLabel: t('adjust.undoLabel', { amount: isr(Math.abs(Number(amount) || 0)) }),
    })
  }

  useEffect(() => {
    if (!open) return
    /* Defer to any modal layered over the drawer (EditClientModal, the payment
       prompt, …) so Escape closes only the top sheet — not the drawer with an
       unsaved edit still open above it. Mirrors MenuDrawer's guard. */
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.m-sheet.open')) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  /* Reset the scroll to the top when a different client opens — the panel
     swaps content in place, so a new (shorter) profile would otherwise open
     scrolled partway down. */
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0 }, [client?.id])

  /* Change the client's status with a one-step undo (restores the prior
     status_meta + status_id + override flag). Picking a status manually
     ALWAYS sets status_overridden = true so the choice wins over any group
     the client belongs to (migration 0062). No-op only when the manual
     value is already the active one. */
  const changeStatus = (k) => {
    if (!client) { setStatusMenu(false); return }
    if (client.status_meta === k && client.status_overridden) { setStatusMenu(false); return }
    const prev = { status_meta: client.status_meta ?? null, status_id: client.status_id ?? null, status_overridden: !!client.status_overridden }
    const next = { status_meta: k, status_id: null, status_overridden: true }
    onUpdateClient?.(client.id, next)
    setStatusMenu(false)
    pushUndo({
      label: t('drawer.statusChanged'),
      undo: async () => { await onUpdateClient?.(client.id, prev) },
      redo: async () => { await onUpdateClient?.(client.id, next) },
    })
  }

  /* Clear a manual override so the status goes back to being driven by the
     client's group(s). status_meta is left untouched — effectiveClientMeta
     ignores it while the client is a (non-overridden) group member. */
  const revertToGroup = () => {
    if (!client || !client.status_overridden) return
    onUpdateClient?.(client.id, { status_overridden: false })
    setStatusMenu(false)
    pushUndo({
      label: t('drawer.statusReverted'),
      undo: async () => { await onUpdateClient?.(client.id, { status_overridden: true }) },
      redo: async () => { await onUpdateClient?.(client.id, { status_overridden: false }) },
    })
  }

  /* Active payment plan (if any) — surfaced as a hint in the billing hero so
     the plan's remaining and the client's balance read as ONE system, not two
     competing numbers. */
  const { plans, installments } = usePaymentPlans()
  const clientPlan = client ? (plans.find((p) => p.client_id === client.id) || null) : null
  const planBal = clientPlan ? planBalance(clientPlan, planInstallments(clientPlan.id, installments)) : null

  const meta = client ? effectiveClientMeta(client, members, groups) : null
  const groupDriven = isGroupDriven(client, members)
  const overridden = isStatusOverridden(client)
  const project = client ? projects.find((p) => p.id === client.project_id) : null
  const balance = client ? clientBalance(client, txns, sessions, members, groups) : null
  const isMember = !!client && members.some((m) => m.client_id === client.id && !m.left_at)
  const clientSessions = client ? sessions.filter((s) => s.client_id === client.id) : []
  const nextNum = clientSessions.length + 1

  return (
    <>
      <Box className={`cd-overlay${open ? ' open' : ''}`} onClick={onClose} aria-hidden="true" />
      <Box as="aside" className={`cd-panel${open ? ' open' : ''}`} aria-label={t('drawer.fileAria')} aria-hidden={!open}>
        {client && (
          <>
            <Box className="cd-topbar">
              <Btn type="button" className="cd-top-btn" onClick={onClose} aria-label={t('drawer.closeAria')}>
                <X size={18} strokeWidth={1.6} />
              </Btn>
              <Txt className="cd-top-title">{t('drawer.title')}</Txt>
              <Btn type="button" className="cd-top-btn danger" title={t('drawer.deleteAria')} onClick={onDelete}>
                <Trash2 size={17} strokeWidth={1.6} />
              </Btn>
            </Box>

            <Box className="cd-scroll" ref={scrollRef}>
              <Box className="cd-header">
                <Box className="cd-h-av">{initials(client.name)}</Box>
                <Box className="cd-h-id">
                  <Txt as="p" className="cd-h-name">{client.name}</Txt>
                  <Box className="cd-h-sub">
                    <Txt className="cd-status-pick">
                      <Btn
                        type="button"
                        className={`cd-h-status cd-status-${meta} is-btn`}
                        aria-haspopup="menu"
                        aria-expanded={statusMenu}
                        onClick={() => setStatusMenu((o) => !o)}
                      >
                        <MG text={t(STATUS_KEY[meta] || STATUS_KEY.no_status)} />
                        <ChevronDown size={12} strokeWidth={2} aria-hidden="true" />
                      </Btn>
                      {statusMenu && (
                        <>
                          <Btn type="button" className="cd-status-backdrop" aria-hidden="true" tabIndex={-1} onClick={() => setStatusMenu(false)} />
                          <Box className="cd-status-menu" role="menu">
                            {Object.entries(STATUS_KEY).map(([k, labelKey]) => (
                              <Btn
                                key={k}
                                type="button"
                                role="menuitemradio"
                                aria-checked={meta === k}
                                className={`cd-status-opt${meta === k ? ' on' : ''}`}
                                onClick={() => changeStatus(k)}
                              >
                                <Txt className={`cd-status-dot cd-status-${k}`} aria-hidden="true" />
                                {t(labelKey)}
                                {meta === k && <Check size={13} strokeWidth={2} aria-hidden="true" className="cd-status-check" />}
                              </Btn>
                            ))}
                          </Box>
                        </>
                      )}
                    </Txt>
                    {/* Group member, status still group-driven → muted hint that
                        picking a status will override it. Once overridden → a
                        "manual" tag + one-tap revert back to the group status. */}
                    {groupDriven && (
                      <Txt className="cd-h-status-by" title={t('drawer.statusByGroup')}>{t('drawer.byGroup')}</Txt>
                    )}
                    {isMember && overridden && (
                      <Txt className="cd-status-manual">
                        <Txt className="cd-status-manual-tag">{t('drawer.statusManual')}</Txt>
                        <Btn type="button" className="cd-status-revert" onClick={revertToGroup} title={t('drawer.revertHint')}>
                          <RotateCcw size={11} strokeWidth={1.8} aria-hidden="true" />
                          {t('drawer.revertToGroup')}
                        </Btn>
                      </Txt>
                    )}
                    {project && <Txt className="cd-h-proj">· {project.name}</Txt>}
                  </Box>
                </Box>
                <Btn type="button" className="cd-edit-details" onClick={() => setActionModal('edit')}>
                  <Pencil size={13} strokeWidth={1.6} aria-hidden="true" /> {t('drawer.edit')}
                </Btn>
              </Box>

              {/* Billing hero — ALWAYS shown on every client card (global).
                 "פגישות" = PERSONAL (done/set) when the client has 1-on-1
                 sessions; otherwise it summarises the group(s). */}
              <Box className="cd-hero">
                <Box className="cd-stat">
                  <Txt as="p" className="cd-stat-l">{t('drawer.sessions')}</Txt>
                  <Txt as="p" className="cd-stat-v mono">
                    {balance.hasPersonal
                      ? (balance.perSession
                        /* Per-session billing (migration 0014) — no preset
                           quota, so only the held count is meaningful. */
                        ? `${balance.personalDone}`
                        : `${balance.personalDone}/${balance.personalQuota || 0}`)
                      : `${balance.groupSessions.filter((g) => !g.ended).reduce((s, g) => s + g.held, 0)}/${balance.groupSessions.filter((g) => !g.ended).reduce((s, g) => s + (g.quota || 0), 0) || 0}`}
                  </Txt>
                </Box>
                <Box className="cd-stat divided">
                  <Txt as="p" className="cd-stat-l">{t('drawer.paid')}</Txt>
                  <Txt as="p" className="cd-stat-v mono">{isr(balance.paid)}</Txt>
                </Box>
                <Box className="cd-stat">
                  <Txt as="p" className="cd-stat-l">{t('drawer.balance')}</Txt>
                  <Txt as="p" className="cd-stat-v mono">{isr(balance.balance)}</Txt>
                </Box>
              </Box>

              {/* One discoverable way in for a discount / an import fix / cash
                  that was never booked — instead of knowing that each of those
                  is entered by hand-editing a different number. */}
              <Btn type="button" className="cd-adjust-link" onClick={() => setActionModal('adjust')}>
                {t('adjust.open')}
              </Btn>

              {/* Per-session billing note — names the model so the growing
                 balance after each logged meeting is self-explanatory. */}
              {balance.perSession && (
                <Txt as="p" className="cd-billmode">{t('drawer.perSessionNote', { price: isr(client.price_per_session || 0) })}</Txt>
              )}

              {/* Payment-plan hint — links the hero balance to the plan so the
                  two don't read as separate "balances". */}
              {clientPlan && planBal && (
                <Txt as="p" className="cd-plan-hint">{t('drawer.planHint', { received: planBal.receivedCount, total: planBal.count, remaining: isr(planBal.remaining) })}</Txt>
              )}

              {/* Group sessions — read-only breakdown, one row per group.
                 The full profile shows these in addition to the personal
                 count above (the compact list card shows personal only). */}
              {balance.groupSessions.length > 0 && (
                <Box className="cd-grp-sessions">
                  {balance.groupSessions.map((gs) => (
                    <Box key={gs.id} className="cd-grp-row">
                      <Txt className="cd-grp-name">{t('drawer.groupSessions', { name: gs.name })}{gs.ended ? t('drawer.groupEnded') : ''}</Txt>
                      <Txt className="cd-grp-val mono">{gs.held}/{gs.quota || 0}</Txt>
                    </Box>
                  ))}
                </Box>
              )}

              {/* Payment request — only when the client owes money. The
                 outstanding balance fills the message automatically. */}
              {balance.balance > 0 && (
                <>
                  <WhatsAppButton
                    showLabel
                    triggerClassName="cd-pay-request"
                    label={t('drawer.requestPayment')}
                    phone={client.phone}
                    message={waMsg('payment', { name: client.name, balance: isr(balance.balance) })}
                  />
                  {/* Online payment via Grow — only renders when the gateway is
                      enabled + connected (hidden while locked). */}
                  <GrowPayButton
                    source="client"
                    clientId={client.id}
                    amount={balance.balance}
                    description={t('drawer.requestPayment')}
                    clientName={client.name}
                    clientPhone={client.phone}
                  />
                </>
              )}

              {/* Quick actions — ALWAYS shown on every client card (global). */}
              <Box className="cd-actions">
                <Btn type="button" className="cd-action" onClick={() => setActionModal('session')}>
                  <Check size={15} strokeWidth={1.8} aria-hidden="true" /> {t('drawer.logSession')}
                </Btn>
                <Btn type="button" className="cd-action" onClick={() => setActionModal('meeting')}>
                  <CalendarPlus size={15} strokeWidth={1.8} aria-hidden="true" /> {t('drawer.scheduleMeeting')}
                </Btn>
                <Btn type="button" className="cd-action" onClick={() => { setPaymentAmount(null); setActionModal('payment') }}>
                  <Banknote size={15} strokeWidth={1.8} aria-hidden="true" /> {t('drawer.receivedPayment')}
                </Btn>
                <WhatsAppButton
                  phone={client.phone}
                  message={waMsg('client', { name: client.name })}
                />
              </Box>

              {/* onUpdateClient lets the single-value sections (recurring slot /
                  more details / notes) save in place instead of opening the
                  full edit modal. It's the screen's wrapped updater, so a
                  recurring-slot change still clears the stale pending
                  meetings generated for the old slot. */}
              <ClientDrawerSections client={client} balance={balance} txns={txns} tasks={tasks} reminders={reminders} sessions={sessions} members={members} groups={groups} adjustments={clientAdjustments} onEditTx={setEditTx} onEditClient={() => setActionModal('edit')} onEditSession={setEditSession} onEditTask={setEditTask} onEditReminder={setEditReminder} onUpdateClient={onUpdateClient} />
            </Box>
          </>
        )}
      </Box>

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
        onSetRecurringSlot={onUpdateClient}
      />
      <AddTransactionModal
        key={`pay-${client?.id}-${paymentAmount ?? 'x'}`}
        open={actionModal === 'payment'}
        /* No informal-credit fallback here any more: when this opens from the
           adjustment sheet the adjustment is already recorded, so closing
           without booking income loses nothing. */
        onClose={() => { setActionModal(null); setPaymentAmount(null) }}
        client={client}
        projects={projects}
        defaultType="income"
        defaults={paymentAmount != null ? { amount: String(Math.abs(paymentAmount)), desc: t('drawer.paymentDefaultDesc') } : {}}
        onSave={onAddPayment}
      />
      {/* Key includes the open-state so the form RE-SEEDS from fresh props
          every time it opens. Without this, the modal stays mounted (Modal
          keeps children mounted) with a one-time snapshot taken when the
          drawer first opened — so a status/session/paid change made via the
          drawer's own quick-actions would be silently reverted on the next
          "ערוך פרטים" → save. Mirrors how the sibling edit modals below key
          off their open-gate (editTx?.id, editSession?.id …). */}
      <EditClientModal
        key={`edit-${client?.id}-${actionModal === 'edit'}`}
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
        /* A hand-edited «שולם» is money the user says arrived; a hand-edited
           «יתרה» is debt they're writing off. Each opens the adjustment sheet
           with that reason pre-picked, so both land in the ledger. */
        onPaidEntry={(delta) => setPendingAdjust({ amount: delta, reason: 'unrecorded_payment' })}
        onBalanceEntry={(delta) => setPendingAdjust({ amount: delta, reason: 'discount' })}
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
        onIssued={onIssued}
        onDelete={onRemoveTransaction}
      />

      {/* Edit an existing session / task / reminder from its panel. */}
      <AddSessionModal
        key={`edit-sess-${editSession?.id}`}
        open={!!editSession}
        onClose={() => setEditSession(null)}
        client={client}
        session={editSession}
        onSave={(patch) => onEditSession?.(editSession.id, patch)}
      />
      <AddTaskModal
        key={`edit-task-${editTask?.id}`}
        open={!!editTask}
        onClose={() => setEditTask(null)}
        task={editTask}
        projects={projects}
        clients={clients}
        onSave={(patch) => onEditTask?.(editTask.id, patch)}
      />
      <AddReminderModal
        key={`edit-rem-${editReminder?.id}`}
        open={!!editReminder}
        onClose={() => setEditReminder(null)}
        reminder={editReminder}
        clients={clients}
        onSave={(patch) => onEditReminder?.(editReminder.id, patch)}
      />

      {/* Manual adjustment — opened either from the billing hero, or seeded
          by a hand-edited «שולם»/«יתרה» in the edit modal. Keyed on the seed
          so it re-seeds every time it opens (Modal keeps children mounted). */}
      <AdjustmentModal
        key={`adj-${client?.id}-${pendingAdjust?.amount ?? 'x'}-${actionModal === 'adjust'}`}
        open={actionModal === 'adjust' || !!pendingAdjust}
        onClose={() => { setActionModal(null); setPendingAdjust(null) }}
        balance={balance}
        presetAmount={pendingAdjust?.amount ?? null}
        presetReason={pendingAdjust?.reason ?? null}
        onSave={recordAdjustment}
        onAlsoRecordIncome={(amount) => { setPaymentAmount(amount); setActionModal('payment') }}
      />
    </>
  )
}
