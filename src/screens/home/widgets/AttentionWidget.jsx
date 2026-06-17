import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, Calendar, Target, AlertCircle, Clock, Bell, ChevronLeft, ChevronDown, CalendarClock } from 'lucide-react'
import { attentionItems } from '../../../lib/homeData'
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
import { useT } from '../../../i18n/useT'

const ICONS = { Wallet, Calendar, Target, AlertCircle, Clock, Bell }

/* "דרושה תשומת לב" — composed rows from pending tx, pending meetings,
   balances, goal gap, urgent tasks, 45-day client/lead rules. The actionable
   rows (pending transactions / pending meetings) open an approve-skip-delete
   popup; the rest navigate to their screen. Also hosts the generation hooks
   that materialise pending meetings + linked expenses on home (moved here from
   the now-removed meeting-confirm widget). */
export default function AttentionWidget() {
  const { t } = useT('home')
  const navigate = useNavigate()
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

  const items = useMemo(
    () => attentionItems(new Date(), { transactions, scheduled_meetings: meetings, clients, tasks, goals, categories: goalCategories, sessions, leads, members, groups }),
    [transactions, meetings, clients, tasks, goals, goalCategories, sessions, leads, members, groups],
  )

  /* Calendar duplicates (app recurring meeting ⇄ synced Google event) surface
     as one attention row here that opens the shared resolver modal. */
  const { duplicates, hideMeeting, hideEvent } = useCalendarDuplicates({
    meetings, calendarEvents, clients, groups, updateMeeting, dismissEvent,
  })

  /* Closed = title + summary of what's inside; click opens the full list. */
  const [open, setOpen] = useState(false)
  const [popup, setPopup] = useState(null) /* 'tx' | 'meetings' | null */

  const pendingTxs = useMemo(
    () => (transactions || []).filter((t) => !t.deleted_at && t.status === 'pending'),
    [transactions],
  )

  const dupText = duplicates.length > 0
    ? t('widgets.attention.dup', { count: duplicates.length })
    : null
  const totalCount = items.length + (dupText ? 1 : 0)
  const summaryParts = [dupText, ...items.map((it) => it.text)].filter(Boolean)
  const summary = totalCount === 0
    ? t('widgets.attention.allClear')
    : summaryParts.slice(0, 2).join(' · ') + (summaryParts.length > 2 ? ` · ${t('widgets.attention.more', { count: summaryParts.length - 2 })}` : '')

  /* Actionable rows open a popup; the rest navigate. */
  const onRow = (it) => {
    if (it.kind === 'pendingTx') setPopup('tx')
    else if (it.kind === 'pendingMeetings') setPopup('meetings')
    else if (it.to) navigate(it.to)
  }

  return (
    <>
      <div
        className={`h-card is-expandable${open ? ' is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="h-card-head">
          <span className="h-card-title">
            <Bell size={20} strokeWidth={1.5} aria-hidden="true" /> {t('widgets.attention.title')}
            <InfoPopover
              label={t('widgets.attention.infoLabel')}
              text={t('widgets.attention.infoText')}
            />
          </span>
          <span className="h-card-count">{t('widgets.attention.count', { count: totalCount })}</span>
          <ChevronDown size={16} strokeWidth={1.7} className="h-card-chevron" aria-hidden="true" />
        </div>
        {open ? (
          <div className="h-card-list">
            {duplicates.length > 0 && (
              <button type="button" className="h-attn-row" onClick={(e) => { e.stopPropagation(); setPopup('duplicates') }}>
                <CalendarClock size={16} strokeWidth={1.6} className="h-attn-icon" aria-hidden="true" />
                <span className="h-attn-text">{dupText}</span>
                <ChevronLeft size={16} strokeWidth={1.6} className="h-row-chevron" aria-hidden="true" />
              </button>
            )}
            {items.length ? (
              items.map((it, i) => {
                const Icon = ICONS[it.icon] || Bell
                return (
                  <button key={i} type="button" className="h-attn-row" onClick={(e) => { e.stopPropagation(); onRow(it) }}>
                    <Icon size={16} strokeWidth={1.6} className="h-attn-icon" aria-hidden="true" />
                    <span className="h-attn-text">{it.text}</span>
                    <ChevronLeft size={16} strokeWidth={1.6} className="h-row-chevron" aria-hidden="true" />
                  </button>
                )
              })
            ) : duplicates.length === 0 ? (
              <p className="h-card-empty">{t('widgets.attention.empty')}</p>
            ) : null}
          </div>
        ) : (
          <p className="h-card-summary">{summary}</p>
        )}
      </div>

      <Modal open={popup === 'tx'} onClose={() => setPopup(null)} title={t('widgets.attention.txModalTitle')}>
        {pendingTxs.length === 0 ? (
          <p className="h-card-empty">{t('widgets.attention.txEmpty')}</p>
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

      <CalendarDuplicateModal
        open={popup === 'duplicates'}
        onClose={() => setPopup(null)}
        duplicates={duplicates}
        onHideMeeting={hideMeeting}
        onHideEvent={hideEvent}
      />
    </>
  )
}
