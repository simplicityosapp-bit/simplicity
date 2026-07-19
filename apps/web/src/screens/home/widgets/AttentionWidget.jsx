import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, Calendar, Target, AlertCircle, Clock, Bell, ChevronLeft, ChevronDown, CalendarClock, FileDown } from 'lucide-react'
import { attentionItems } from '../../../lib/homeData'
import { ROUTES } from '../../../lib/routes'
import { useWhatsAppMessage } from '../../../hooks/useWhatsAppMessage'
import WhatsAppButton from '../../../components/WhatsAppButton'
import InfoPopover from '../../../components/InfoPopover'
import Modal from '../../../modals/Modal'
import PendingSection from '../../finance/PendingSection'
import MeetingConfirmList from './MeetingConfirmList'
import { useTransactions } from '../../../hooks/useTransactions'
import { useScheduledMeetings } from '../../../hooks/useScheduledMeetings'
import { useScheduledMeetingsGeneration } from '../../../hooks/useScheduledMeetingsGeneration'
import { useRecurringGeneration } from '../../../hooks/useRecurringGeneration'
import { useClients } from '../../../hooks/useClients'
import { useGroups } from '../../../hooks/useGroups'
import { useGroupMembers } from '../../../hooks/useGroupMembers'
import { useTasks } from '../../../hooks/useTasks'
import { useGoals } from '../../../hooks/useGoals'
import { useGoalCategories } from '../../../hooks/useGoalCategories'
import { useCategories } from '../../../hooks/useCategories'
import { useProjects } from '../../../hooks/useProjects'
import { useRecurring } from '../../../hooks/useRecurring'
import { useSessions } from '../../../hooks/useSessions'
import { useLeads } from '../../../hooks/useLeads'
import { useCalendarEvents } from '../../../hooks/useCalendarEvents'
import { useCalendarDuplicates } from '../../../hooks/useCalendarDuplicates'
import CalendarDuplicateModal from '../../../modals/CalendarDuplicateModal'
import { useBookings } from '../../../hooks/useBookings'
import { useBookingsGeneration } from '../../../hooks/useBookingsGeneration'
import BookingConfirmList from './BookingConfirmList'
import { useInvoiceImports } from '../../../hooks/useInvoiceImports'
import InvoiceImports from '../../finance/InvoiceImports'
import { useT } from '../../../i18n/useT'
import { Box, Txt, Btn } from '../../../components/ui'

const ICONS = { Wallet, Calendar, Target, AlertCircle, Clock, Bell }

/* Non-actionable attention rows navigate to their entity's screen. Items from
   attentionItems() carry a `target` key — the row handler used to check `it.to`,
   which NO item ever sets, so every navigating row (open balances, goal-gap,
   urgent tasks, pending leads) was a dead click. Map target → route instead. */
const TARGET_ROUTE = {
  finance: ROUTES.FINANCE,
  calendar: ROUTES.CALENDAR,
  clients: ROUTES.CLIENTS,
  goals: ROUTES.GOALS,
  tasks: ROUTES.TASKS,
  leads: ROUTES.LEADS,
}

/* "דרושה תשומת לב" — composed rows from pending tx, pending meetings,
   balances, goal gap, urgent tasks, 45-day client/lead rules. The actionable
   rows (pending transactions / pending meetings) open an approve-skip-delete
   popup; the rest navigate to their screen. Also hosts the generation hooks
   that materialise pending meetings + linked expenses on home (moved here from
   the now-removed meeting-confirm widget). */
export default function AttentionWidget() {
  const { t, lang } = useT('home')
  const navigate = useNavigate()
  const waMsg = useWhatsAppMessage()
  const { transactions, setStatus: setTxStatus, removeTransaction, addTransaction, loading: transactionsLoading } = useTransactions()
  const { meetings, addMeeting, updateMeeting, loading: meetingsLoading } = useScheduledMeetings()
  const { clients } = useClients()
  const { groups } = useGroups()
  const { members } = useGroupMembers()
  const { tasks } = useTasks()
  const { goals } = useGoals()
  const { categories: goalCategories } = useGoalCategories()
  const { categories: financeCategories } = useCategories()
  const { projects } = useProjects()
  const { templates } = useRecurring()
  const { sessions } = useSessions()
  const { leads } = useLeads()
  const { events: calendarEvents, dismissEvent } = useCalendarEvents()
  const { bookings, materialize, loading: bookingsLoading } = useBookings()
  /* Route-B invoice imports staged by the provider webhook (a receipt issued
     in SUMIT/Green Invoice) — surface them here so a new receipt raises an
     attention row, not just a section on the finance screen. */
  const { imports: invoiceImports } = useInvoiceImports()

  /* Materialise pending scheduled-meeting rows + their linked on_meeting
     expenses so the attention count + popups are populated on home visit.
     Idempotent — gated on the loading flags so it doesn't race the fetch. */
  useScheduledMeetingsGeneration({ clients, groups, meetings, meetingsLoading, addMeeting })
  useRecurringGeneration({
    templates,
    transactions,
    addTransaction,
    scheduledMeetings: meetings,
    transactionsLoading,
    scheduledMeetingsLoading: meetingsLoading,
  })
  /* Backfill lead + calendar event for auto-confirmed bookings. */
  useBookingsGeneration({ bookings, loading: bookingsLoading, materialize })

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
     opens a small people list with a direct WhatsApp send per person. */
  const [peopleRow, setPeopleRow] = useState(null)

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

  /* Actionable rows open a popup; the rest navigate. */
  const onRow = (it) => {
    if (it.kind === 'pendingTx') setPopup('tx')
    else if (it.kind === 'pendingMeetings') setPopup('meetings')
    else if (it.kind === 'people') setPeopleRow(it)
    else if (it.target && TARGET_ROUTE[it.target]) navigate(TARGET_ROUTE[it.target])
  }
  /* Tap a person → open their card (client) or the leads board (lead). */
  const openPerson = (p) => {
    if (!peopleRow) return
    navigate(peopleRow.entity === 'client' ? ROUTES.CLIENT.replace(':id', p.id) : ROUTES.LEADS)
    setPeopleRow(null)
  }

  return (
    <>
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
          <ChevronDown size={16} strokeWidth={1.7} className="h-card-chevron" aria-hidden="true" />
        </Box>
        {open ? (
          <Box className="h-card-list">
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
                  <Btn key={it.icon + it.text} type="button" className="h-attn-row" onClick={(e) => { e.stopPropagation(); onRow(it) }}>
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

      <Modal open={!!peopleRow} onClose={() => setPeopleRow(null)} title={peopleRow?.text || t('widgets.attention.reachOut')}>
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
            </Box>
          ))}
        </Box>
      </Modal>
    </>
  )
}
