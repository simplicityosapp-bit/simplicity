import { useMemo } from 'react'
import { Calendar, Check, X } from 'lucide-react'
import { useClients } from '../../../hooks/useClients'
import { useGroups } from '../../../hooks/useGroups'
import { useScheduledMeetings } from '../../../hooks/useScheduledMeetings'
import { useScheduledMeetingsGeneration } from '../../../hooks/useScheduledMeetingsGeneration'
import { useTransactions } from '../../../hooks/useTransactions'
import { useRecurring } from '../../../hooks/useRecurring'
import { useRecurringGeneration } from '../../../hooks/useRecurringGeneration'
import { useCategories } from '../../../hooks/useCategories'
import { pendingMeetingsToReview } from '../../../lib/scheduledMeetings'
import { isr } from '../../../lib/finance'
import { formatWhen } from '../../../lib/dates'
import { toDateKey } from '../../../lib/recurring'

/* "Did this meeting happen?" — surfaces pending scheduled_meetings
   whose scheduled_at has already passed (within the 14-day window).
   Per row: subject name + when + כן/לא buttons.
   Linked expenses: recurring templates with trigger_type='on_meeting'
   on the same client/group seed a pending transaction for the
   meeting's date. Those appear under the meeting row with their own
   כן/לא buttons. Skipping the meeting cascades to skip the linked
   expense too (no meeting → no consulting fee), but confirming the
   meeting leaves the expense as a separate prompt — the user might
   want to defer paying. */
export default function MeetingConfirmWidget() {
  const { clients } = useClients()
  const { groups } = useGroups()
  const { meetings, loading: meetingsLoading, updateMeeting, addMeeting } = useScheduledMeetings()
  const { transactions, loading: transactionsLoading, addTransaction, setStatus: setTxStatus } = useTransactions()
  const { templates } = useRecurring()
  const { categories } = useCategories()

  /* Materialise any missing scheduled_meeting rows for clients/groups
     with a recurring_day + recurring_time. Idempotent — but only
     gates correctly when meetingsLoading is wired through, otherwise
     the engine races the initial fetch and duplicates every slot. */
  useScheduledMeetingsGeneration({ clients, groups, meetings, meetingsLoading, addMeeting })

  /* And generate the linked pending expense transactions for
     trigger_type='on_meeting' templates — so visiting home is enough
     to surface both prompts in this widget. Idempotent. */
  useRecurringGeneration({
    templates,
    transactions,
    addTransaction,
    scheduledMeetings: meetings,
    transactionsLoading,
    scheduledMeetingsLoading: meetingsLoading,
  })

  const pending = useMemo(() => pendingMeetingsToReview(meetings || []), [meetings])

  const subjectName = (m) => {
    if (m.subject_type === 'client') {
      const c = (clients || []).find((x) => x.id === m.subject_id)
      return c?.name || 'לקוח/ה'
    }
    if (m.subject_type === 'group') {
      const g = (groups || []).find((x) => x.id === m.subject_id)
      return g?.name || 'קבוצה'
    }
    return '—'
  }

  /* Find pending transactions linked to this meeting via an
     on_meeting recurring template. Linkage = template's client_id (or
     group_id) matches the meeting subject AND tx.date matches the
     meeting's date. */
  const linkedTxsForMeeting = (m) => {
    const subjectId = m.subject_type === 'client' ? m.client_id || m.subject_id : null
    const groupId = m.subject_type === 'group' ? m.group_id || m.subject_id : null
    const meetingDateKey = toDateKey(m.scheduled_at)
    return (transactions || []).filter((tx) => {
      if (tx.deleted_at) return false
      if (tx.status !== 'pending') return false
      if (!tx.recurring_id) return false
      if (toDateKey(tx.date) !== meetingDateKey) return false
      const t = (templates || []).find((x) => x.id === tx.recurring_id)
      if (!t || t.trigger_type !== 'on_meeting') return false
      if (m.subject_type === 'client' && t.client_id === m.subject_id) return true
      if (m.subject_type === 'group' && t.group_id === m.subject_id) return true
      return false
    })
  }

  const confirmMeeting = (m) => updateMeeting(m.id, { status: 'confirmed' }).catch(() => {})

  const skipMeeting = (m) => {
    /* Cascade — if the meeting didn't happen, the linked expense
       shouldn't either. The user can still revive it later from the
       finance screen. */
    const linked = linkedTxsForMeeting(m)
    updateMeeting(m.id, { status: 'skipped' }).catch(() => {})
    for (const tx of linked) {
      setTxStatus(tx.id, 'skipped')
    }
  }

  const confirmTx = (tx) => setTxStatus(tx.id, 'confirmed')
  const skipTx = (tx) => setTxStatus(tx.id, 'skipped')

  if (!pending.length) return null

  return (
    <div className="h-card">
      <div className="h-card-head">
        <span className="h-card-title">
          <Calendar size={20} strokeWidth={1.5} aria-hidden="true" /> פגישות לאישור
        </span>
        <span className="h-card-count">{pending.length} {pending.length === 1 ? 'פגישה' : 'פגישות'}</span>
      </div>
      <div className="h-card-list">
        {pending.map((m) => {
          const linkedTxs = linkedTxsForMeeting(m)
          return (
            <div key={m.id} className="mtg-confirm-row">
              <div className="mtg-confirm-head">
                <div className="mtg-confirm-main">
                  <p className="mtg-confirm-name">{subjectName(m)}</p>
                  <p className="mtg-confirm-when">{formatWhen(m.scheduled_at)}</p>
                </div>
                <div className="mtg-confirm-actions">
                  <button type="button" className="mtg-confirm-btn approve" onClick={() => confirmMeeting(m)} aria-label="הפגישה התקיימה">
                    <Check size={15} strokeWidth={2} aria-hidden="true" />
                  </button>
                  <button type="button" className="mtg-confirm-btn skip" onClick={() => skipMeeting(m)} aria-label="לא התקיימה">
                    <X size={15} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {linkedTxs.map((tx) => {
                const cat = tx.category_id ? (categories || []).find((c) => c.id === tx.category_id) : null
                return (
                  <div key={tx.id} className="mtg-confirm-linked">
                    <div className="mtg-confirm-main">
                      <p className="mtg-confirm-tx-desc">
                        <span className="mtg-confirm-tx-amt mono">−{isr(tx.amount)}</span>
                        {tx.desc ? ' · ' + tx.desc : ''}
                      </p>
                      <p className="mtg-confirm-tx-meta">
                        {cat && (
                          <>
                            <span className="mtg-confirm-tx-dot" style={{ background: cat.color || '#888' }} />
                            {cat.name}
                          </>
                        )}
                        {!cat && 'הוצאה צמודה לפגישה'}
                      </p>
                    </div>
                    <div className="mtg-confirm-actions">
                      <button type="button" className="mtg-confirm-btn approve" onClick={() => confirmTx(tx)} aria-label="שולם">
                        <Check size={15} strokeWidth={2} aria-hidden="true" />
                      </button>
                      <button type="button" className="mtg-confirm-btn skip" onClick={() => skipTx(tx)} aria-label="לא שולם">
                        <X size={15} strokeWidth={2} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
