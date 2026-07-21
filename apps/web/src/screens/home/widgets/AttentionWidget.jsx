import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, Calendar, Target, AlertCircle, Clock, Bell, ChevronLeft, ChevronDown, CalendarClock, FileDown, BellOff } from 'lucide-react'
import { attentionItems, attentionRowAction } from '../../../lib/homeData'
import { ROUTES } from '../../../lib/routes'
import { pushUndo } from '../../../lib/undo'
import { useWhatsAppMessage } from '../../../hooks/useWhatsAppMessage'
import WhatsAppButton from '../../../components/WhatsAppButton'
import InfoPopover from '../../../components/InfoPopover'
import Modal from '../../../modals/Modal'
import PendingSection from '../../finance/PendingSection'
import MeetingConfirmList from './MeetingConfirmList'
import { useTransactions } from '../../../hooks/useTransactions'
import { useScheduledMeetings } from '../../../hooks/useScheduledMeetings'
import { useClients } from '../../../hooks/useClients'
import { useGroups } from '../../../hooks/useGroups'
import { useGroupMembers } from '../../../hooks/useGroupMembers'
import { useTasks } from '../../../hooks/useTasks'
import { useGoals } from '../../../hooks/useGoals'
import { useGoalCategories } from '../../../hooks/useGoalCategories'
import { useCategories } from '../../../hooks/useCategories'
import { useProjects } from '../../../hooks/useProjects'
import { useSessions } from '../../../hooks/useSessions'
import { useLeads } from '../../../hooks/useLeads'
import { useCalendarEvents } from '../../../hooks/useCalendarEvents'
import { useCalendarDuplicates } from '../../../hooks/useCalendarDuplicates'
import CalendarDuplicateModal from '../../../modals/CalendarDuplicateModal'
import { useBookings } from '../../../hooks/useBookings'
import BookingConfirmList from './BookingConfirmList'
import { useInvoiceImports } from '../../../hooks/useInvoiceImports'
import InvoiceImports from '../../finance/InvoiceImports'
import { useT } from '../../../i18n/useT'
import { Box, Txt, Btn } from '../../../components/ui'

const ICONS = { Wallet, Calendar, Target, AlertCircle, Clock, Bell }

/* "דרושה תשומת לב" — composed rows from pending tx, pending meetings,
   balances, goal gap, urgent tasks, 45-day client/lead rules. The actionable
   rows (pending transactions / pending meetings) open an approve-skip-delete
   popup; the rest navigate to their screen.

   The materialisation engines used to live here on the assumption that this
   widget always mounts on home — it doesn't, it can be switched off in
   Settings. They now sit in <HomeGenerators/>, mounted by HomeScreen itself. */
export default function AttentionWidget() {
  const { t, lang } = useT('home')
  const navigate = useNavigate()
  const waMsg = useWhatsAppMessage()
  const { transactions, setStatus: setTxStatus, removeTransaction } = useTransactions()
  const { meetings, updateMeeting } = useScheduledMeetings()
  const { clients, updateClient } = useClients()
  const { groups } = useGroups()
  const { members } = useGroupMembers()
  const { tasks } = useTasks()
  const { goals } = useGoals()
  const { categories: goalCategories } = useGoalCategories()
  const { categories: financeCategories } = useCategories()
  const { projects } = useProjects()
  const { sessions } = useSessions()
  const { leads } = useLeads()
  const { events: calendarEvents, dismissEvent } = useCalendarEvents()
  const { bookings } = useBookings()
  /* Route-B invoice imports staged by the provider webhook (a receipt issued
     in SUMIT/Green Invoice) — surface them here so a new receipt raises an
     attention row, not just a section on the finance screen. */
  const { imports: invoiceImports } = useInvoiceImports()

  const items = useMemo(
    () => attentionItems(new Date(), { transactions, scheduled_meetings: meetings, clients, tasks, goals, categories: goalCategories, sessions, leads, members, groups }),
    /* `lang` is a dep so row labels recompute when the UI language switches —
       attentionItems() reads the active language internally via i18n.t, so the
       linter can't see the use. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, meetings, clients, tasks, goals, goalCategories, sessions, leads, members, groups, lang],
  )

  /* Calendar duplicates (app recurring meeting ⇄ synced Google event) surface
     as one attention row here that opens the shared resolver modal. */
  const { duplicates, hideMeeting, hideEvent } = useCalendarDuplicates({
    meetings, calendarEvents, clients, groups, updateMeeting, dismissEvent,
  })

  /* Closed = title + summary of what's inside; click opens the full list. */
  const [open, setOpen] = useState(false)
  const [popup, setPopup] = useState(null) /* 'tx' | 'meetings' | null */
  /* A clicked contact-row (stale clients / stale leads / today's follow-ups)
     opens a small people list with a direct WhatsApp send per person. Only the
     row's ID is held, never the row object: the row is re-resolved from the
     freshly computed items on every render, so dismissing a client drops them
     out of the open list — and closes the modal once the last one goes —
     instead of leaving a stale snapshot on screen. */
  const [peopleId, setPeopleId] = useState(null)
  const peopleRow = useMemo(
    () => (peopleId ? items.find((it) => it.rowId === peopleId) || null : null),
    [items, peopleId],
  )

  const pendingTxs = useMemo(
    () => (transactions || []).filter((t) => !t.deleted_at && t.status === 'pending'),
    [transactions],
  )

  const dupText = duplicates.length > 0
    ? t('widgets.attention.dup', { count: duplicates.length })
    : null

  const pendingBookings = useMemo(
    () => (bookings || []).filter((b) => b.status === 'pending'),
    [bookings],
  )
  const bookingsText = pendingBookings.length > 0
    ? t('widgets.attention.bookings', { count: pendingBookings.length })
    : null

  const invoicesText = (invoiceImports?.length || 0) > 0
    ? t('widgets.attention.invoices', { count: invoiceImports.length })
    : null

  const totalCount = items.length + (dupText ? 1 : 0) + (bookingsText ? 1 : 0) + (invoicesText ? 1 : 0)
  const summaryParts = [invoicesText, bookingsText, dupText, ...items.map((it) => it.text)].filter(Boolean)
  const summary = totalCount === 0
    ? t('widgets.attention.allClear')
    : summaryParts.slice(0, 2).join(' · ') + (summaryParts.length > 2 ? ` · ${t('widgets.attention.more', { count: summaryParts.length - 2 })}` : '')

  /* What a row does is decided by attentionRowAction (in homeData, tested
     against the real item shapes) so the handler and the data can't drift —
     a past drift pointed this at `it.target` while items carried `it.to` and
     killed every navigating row. Here we only execute the resolved action. */
  const onRow = (it) => {
    const action = attentionRowAction(it)
    if (!action) return
    if (action.type === 'popup') setPopup(action.popup)
    else if (action.type === 'people') setPeopleId(it.rowId)
    else if (action.type === 'navigate') navigate(action.to)
  }
  /* Tap a person → open their card (client) or the leads board (lead). */
  const openPerson = (p) => {
    if (!peopleRow) return
    navigate(peopleRow.entity === 'client' ? ROUTES.CLIENT.replace(':id', p.id) : ROUTES.LEADS)
    setPeopleId(null)
  }

  /* "התעלם" — stamp attention_snoozed_at so the 45-day rule reads now as the
     latest contact point. The client leaves the list at once and comes back
     only if another 45 days pass with no session (snooze, not mute). Undo
     restores the PREVIOUS stamp rather than blanking the column, so undoing a
     second dismissal doesn't silently un-dismiss the first. */
  const snoozeClient = async (p) => {
    const prev = clients.find((c) => c.id === p.id)?.attention_snoozed_at ?? null
    await updateClient(p.id, { attention_snoozed_at: new Date().toISOString() })
    pushUndo({
      label: t('widgets.attention.snoozed'),
      undo: async () => { await updateClient(p.id, { attention_snoozed_at: prev }) },
      redo: async () => { await updateClient(p.id, { attention_snoozed_at: new Date().toISOString() }) },
    })
  }

  return (
    <>
      {/* The card keeps a pointer-only onClick as a convenience shortcut. It
          deliberately carries NO role="button": that role makes its children
          presentational, which would hide the rows and the info "?" inside it
          from assistive tech. The chevron below is the real, focusable
          disclosure control, so keyboard and screen-reader users get a proper
          one instead of an unreachable div. */}
      <Box
        className={`h-card is-expandable${open ? ' is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Box className="h-card-head">
          <Txt className="h-card-title">
            <Bell size={20} strokeWidth={1.5} aria-hidden="true" /> {t('widgets.attention.title')}
            <InfoPopover
              label={t('widgets.attention.infoLabel')}
              text={t('widgets.attention.infoText')}
            />
          </Txt>
          <Txt className="h-card-count">{t('widgets.attention.count', { count: totalCount })}</Txt>
          <Btn
            type="button"
            className="h-card-toggle"
            aria-expanded={open}
            aria-controls="h-attn-list"
            aria-label={open ? t('widgets.card.collapse') : t('widgets.card.expand')}
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
          >
            <ChevronDown size={16} strokeWidth={1.7} className="h-card-chevron" aria-hidden="true" />
          </Btn>
        </Box>
        {open ? (
          <Box className="h-card-list" id="h-attn-list">
            {(invoiceImports?.length || 0) > 0 && (
              <Btn type="button" className="h-attn-row" onClick={(e) => { e.stopPropagation(); setPopup('invoices') }}>
                <FileDown size={16} strokeWidth={1.6} className="h-attn-icon" aria-hidden="true" />
                <Txt className="h-attn-text">{invoicesText}</Txt>
                <ChevronLeft size={16} strokeWidth={1.6} className="h-row-chevron" aria-hidden="true" />
              </Btn>
            )}
            {pendingBookings.length > 0 && (
              <Btn type="button" className="h-attn-row" onClick={(e) => { e.stopPropagation(); setPopup('bookings') }}>
                <Calendar size={16} strokeWidth={1.6} className="h-attn-icon" aria-hidden="true" />
                <Txt className="h-attn-text">{bookingsText}</Txt>
                <ChevronLeft size={16} strokeWidth={1.6} className="h-row-chevron" aria-hidden="true" />
              </Btn>
            )}
            {duplicates.length > 0 && (
              <Btn type="button" className="h-attn-row" onClick={(e) => { e.stopPropagation(); setPopup('duplicates') }}>
                <CalendarClock size={16} strokeWidth={1.6} className="h-attn-icon" aria-hidden="true" />
                <Txt className="h-attn-text">{dupText}</Txt>
                <ChevronLeft size={16} strokeWidth={1.6} className="h-row-chevron" aria-hidden="true" />
              </Btn>
            )}
            {items.length ? (
              items.map((it) => {
                const Icon = ICONS[it.icon] || Bell
                return (
                  <Btn key={it.rowId} type="button" className="h-attn-row" onClick={(e) => { e.stopPropagation(); onRow(it) }}>
                    <Icon size={16} strokeWidth={1.6} className="h-attn-icon" aria-hidden="true" />
                    <Txt className="h-attn-text">{it.text}</Txt>
                    <ChevronLeft size={16} strokeWidth={1.6} className="h-row-chevron" aria-hidden="true" />
                  </Btn>
                )
              })
            ) : (duplicates.length === 0 && pendingBookings.length === 0 && (invoiceImports?.length || 0) === 0) ? (
              <Txt as="p" className="h-card-empty">{t('widgets.attention.empty')}</Txt>
            ) : null}
          </Box>
        ) : (
          <Txt as="p" className="h-card-summary">{summary}</Txt>
        )}
      </Box>

      <Modal open={popup === 'tx'} onClose={() => setPopup(null)} title={t('widgets.attention.txModalTitle')}>
        {pendingTxs.length === 0 ? (
          <Txt as="p" className="h-card-empty">{t('widgets.attention.txEmpty')}</Txt>
        ) : (
          <PendingSection
            embedded
            transactions={pendingTxs}
            clients={clients}
            projects={projects}
            categories={financeCategories}
            onApprove={(id) => setTxStatus(id, 'confirmed')}
            onSkip={(id) => setTxStatus(id, 'skipped')}
            onDelete={(id) => removeTransaction(id)}
          />
        )}
      </Modal>

      <Modal open={popup === 'meetings'} onClose={() => setPopup(null)} title={t('widgets.attention.meetingsModalTitle')}>
        <MeetingConfirmList />
      </Modal>

      <Modal open={popup === 'bookings'} onClose={() => setPopup(null)} title={t('widgets.attention.bookingsModalTitle')}>
        <BookingConfirmList />
      </Modal>

      <Modal open={popup === 'invoices'} onClose={() => setPopup(null)} title={t('widgets.attention.invoicesModalTitle')}>
        <InvoiceImports />
      </Modal>

      <CalendarDuplicateModal
        open={popup === 'duplicates'}
        onClose={() => setPopup(null)}
        duplicates={duplicates}
        onHideMeeting={hideMeeting}
        onHideEvent={hideEvent}
      />

      <Modal open={!!peopleRow} onClose={() => setPeopleId(null)} title={peopleRow?.text || t('widgets.attention.reachOut')}>
        {peopleRow?.rowId === 'staleClients' ? (
          <Txt as="p" className="h-people-hint">{t('widgets.attention.staleClientsHint')}</Txt>
        ) : null}
        <Box className="h-people-list">
          {(peopleRow?.people || []).map((p) => (
            <Box key={p.id} className="h-people-row">
              <Btn type="button" className="h-people-main" onClick={() => openPerson(p)}>
                <Txt className="h-people-name">{p.name}</Txt>
              </Btn>
              {/* Always shown — an empty phone opens WhatsApp's own picker. */}
              <WhatsAppButton
                phone={p.phone || ''}
                message={waMsg(peopleRow.waKey, { name: p.name })}
                triggerClassName="h-people-wa"
              />
              {/* Dismiss is client-only — the snooze column lives on clients,
                  and the two lead rows clear themselves by their own rules. */}
              {peopleRow.rowId === 'staleClients' ? (
                <Btn
                  type="button"
                  className="h-people-snooze"
                  aria-label={t('widgets.attention.snoozeAria', { name: p.name })}
                  onClick={() => snoozeClient(p)}
                >
                  <BellOff size={15} strokeWidth={1.6} aria-hidden="true" />
                  <Txt className="h-people-snooze-label">{t('widgets.attention.snooze')}</Txt>
                </Btn>
              ) : null}
            </Box>
          ))}
        </Box>
      </Modal>
    </>
  )
}
