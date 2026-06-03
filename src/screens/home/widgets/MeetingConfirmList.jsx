import { useMemo } from 'react'
import { Check, X, Trash2 } from 'lucide-react'
import { useClients } from '../../../hooks/useClients'
import { useGroups } from '../../../hooks/useGroups'
import { useScheduledMeetings } from '../../../hooks/useScheduledMeetings'
import { useTransactions } from '../../../hooks/useTransactions'
import { useRecurring } from '../../../hooks/useRecurring'
import { useCategories } from '../../../hooks/useCategories'
import { pendingMeetingsToReview } from '../../../lib/scheduledMeetings'
import { isr } from '../../../lib/finance'
import { formatWhen } from '../../../lib/dates'
import { toDateKey } from '../../../lib/recurring'

/* Pending-meeting review list — extracted from the old MeetingConfirmWidget,
   now rendered inside the home "דרושה תשומת לב" popup. Per meeting: name +
   when + ✓ happened / ✗ didn't / 🗑 delete, plus any linked on_meeting expense
   with its own ✓/✗/🗑. The rows are MATERIALISED by the generation hooks in
   AttentionWidget (which always mounts on home), so the attention count is
   populated before this popup opens. */
export default function MeetingConfirmList() {
  const { clients } = useClients()
  const { groups } = useGroups()
  const { meetings, updateMeeting, removeMeeting } = useScheduledMeetings()
  const { transactions, setStatus: setTxStatus, removeTransaction } = useTransactions()
  const { templates } = useRecurring()
  const { categories } = useCategories()

  const pending = useMemo(() => pendingMeetingsToReview(meetings || []), [meetings])

  const subjectName = (m) => {
    if (m.subject_type === 'client') return (clients || []).find((x) => x.id === m.subject_id)?.name || 'לקוח/ה'
    if (m.subject_type === 'group') return (groups || []).find((x) => x.id === m.subject_id)?.name || 'קבוצה'
    return '—'
  }

  /* Pending transactions linked to this meeting via an on_meeting template. */
  const linkedTxsForMeeting = (m) => {
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
    /* If the meeting didn't happen, its linked expense shouldn't either. */
    const linked = linkedTxsForMeeting(m)
    updateMeeting(m.id, { status: 'skipped' }).catch(() => {})
    for (const tx of linked) setTxStatus(tx.id, 'skipped')
  }
  const deleteMeeting = (m) => removeMeeting(m.id)
  const confirmTx = (tx) => setTxStatus(tx.id, 'confirmed')
  const skipTx = (tx) => setTxStatus(tx.id, 'skipped')
  const deleteTx = (tx) => removeTransaction(tx.id)

  if (!pending.length) {
    return <p className="h-card-empty" style={{ margin: '4px 2px' }}>אין פגישות שממתינות לאישור.</p>
  }

  return (
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
                <button type="button" className="mtg-confirm-btn delete" onClick={() => deleteMeeting(m)} aria-label="מחק פגישה">
                  <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
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
                      {cat ? (
                        <>
                          <span className="mtg-confirm-tx-dot" style={{ background: cat.color || 'var(--stone)' }} />
                          {cat.name}
                        </>
                      ) : 'הוצאה צמודה לפגישה'}
                    </p>
                  </div>
                  <div className="mtg-confirm-actions">
                    <button type="button" className="mtg-confirm-btn approve" onClick={() => confirmTx(tx)} aria-label="שולם">
                      <Check size={15} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button type="button" className="mtg-confirm-btn skip" onClick={() => skipTx(tx)} aria-label="לא שולם">
                      <X size={15} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button type="button" className="mtg-confirm-btn delete" onClick={() => deleteTx(tx)} aria-label="מחק תנועה">
                      <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
