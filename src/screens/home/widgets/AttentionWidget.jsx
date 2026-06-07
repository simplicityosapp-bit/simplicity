import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, Calendar, Target, AlertCircle, Clock, Bell, ChevronLeft } from 'lucide-react'
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

const ICONS = { Wallet, Calendar, Target, AlertCircle, Clock, Bell }

/* "דרושה תשומת לב" — composed rows from pending tx, pending meetings,
   balances, goal gap, urgent tasks, 45-day client/lead rules. The actionable
   rows (pending transactions / pending meetings) open an approve-skip-delete
   popup; the rest navigate to their screen. Also hosts the generation hooks
   that materialise pending meetings + linked expenses on home (moved here from
   the now-removed meeting-confirm widget). */
export default function AttentionWidget() {
  const navigate = useNavigate()
  const { transactions, setStatus: setTxStatus, removeTransaction, addTransaction, loading: transactionsLoading } = useTransactions()
  const { meetings, addMeeting, loading: meetingsLoading } = useScheduledMeetings()
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

  /* Closed = title + summary of what's inside; click opens the full list. */
  const [open, setOpen] = useState(false)
  const [popup, setPopup] = useState(null) /* 'tx' | 'meetings' | null */

  const pendingTxs = useMemo(
    () => (transactions || []).filter((t) => !t.deleted_at && t.status === 'pending'),
    [transactions],
  )

  const summary = items.length === 0
    ? 'הכל תחת שליטה — אין פריטים פתוחים'
    : items.slice(0, 2).map((it) => it.text).join(' · ') + (items.length > 2 ? ` · ועוד ${items.length - 2}` : '')

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
            <Bell size={20} strokeWidth={1.5} aria-hidden="true" /> דרושה תשומת לב
            <InfoPopover
              label="הסבר דרושה תשומת לב"
              text="פריטים שדורשים פעולה: תנועות ממתינות לאישור, פגישות שעדיין לא סומנו, לקוחות שלא טופלו 45 ימים, ויעדים מתחת לקצב."
            />
          </span>
          <span className="h-card-count">{items.length} {items.length === 1 ? 'פריט' : 'פריטים'}</span>
        </div>
        {open ? (
          <div className="h-card-list">
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
            ) : (
              <p className="h-card-empty">אין פריטים שדורשים תשומת לב כרגע.</p>
            )}
          </div>
        ) : (
          <p className="h-card-summary">{summary}</p>
        )}
      </div>

      <Modal open={popup === 'tx'} onClose={() => setPopup(null)} title="תנועות ממתינות לאישור">
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
      </Modal>

      <Modal open={popup === 'meetings'} onClose={() => setPopup(null)} title="פגישות לאישור">
        <MeetingConfirmList />
      </Modal>
    </>
  )
}
