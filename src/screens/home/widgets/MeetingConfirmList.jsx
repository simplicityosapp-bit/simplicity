import { useMemo } from 'react'
import { Check, X, Trash2 } from 'lucide-react'
import { useClients } from '../../../hooks/useClients'
import { useGroups } from '../../../hooks/useGroups'
import { useScheduledMeetings } from '../../../hooks/useScheduledMeetings'
import { useSessions } from '../../../hooks/useSessions'
import { useTransactions } from '../../../hooks/useTransactions'
import { useRecurring } from '../../../hooks/useRecurring'
import { useCategories } from '../../../hooks/useCategories'
import { pendingMeetingsToReview } from '../../../lib/scheduledMeetings'
import { isr } from '../../../lib/finance'
import { formatWhen } from '../../../lib/dates'
import { toDateKey } from '../../../lib/recurring'
import { useT } from '../../../i18n/useT'

/* Pending-meeting review list — extracted from the old MeetingConfirmWidget,
   now rendered inside the home "דרושה תשומת לב" popup. Per meeting: name +
   when + approve / skip / delete, plus any linked on_meeting expense
   with its own approve / skip / delete. The rows are MATERIALISED by the generation hooks in
   AttentionWidget (which always mounts on home), so the attention count is
   populated before this popup opens. */
export default function MeetingConfirmList() {
  const { t } = useT('home')
  const { clients } = useClients()
  const { groups } = useGroups()
  const { meetings, updateMeeting } = useScheduledMeetings()
  const { sessions, addSession, removeSession } = useSessions()
  const { transactions, setStatus: setTxStatus, removeTransaction } = useTransactions()
  const { templates } = useRecurring()
  const { categories } = useCategories()

  const pending = useMemo(() => pendingMeetingsToReview(meetings || []), [meetings])

  const subjectName = (m) => {
    if (m.subject_type === 'client') return (clients || []).find((x) => x.id === m.subject_id)?.name || t('widgets.meetingConfirm.subjectClient')
    if (m.subject_type === 'group') return (groups || []).find((x) => x.id === m.subject_id)?.name || t('widgets.meetingConfirm.subjectGroup')
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

  /* Next session number for the meeting's subject (mirrors ClientDrawer /
     project-detail: count of the subject's existing sessions + 1). */
  const sessionNum = (m) => (m.subject_type === 'group'
    ? sessions.filter((s) => s.group_id === m.subject_id)
    : sessions.filter((s) => s.client_id === m.subject_id)
  ).length + 1

  /* Confirming "it happened" MATERIALISES a real session and links it via
     scheduled_meetings.session_id — the schema link that was designed but
     never wired, which is why a confirmed meeting never showed up in the
     client/group card or counted toward sessions. Dedup: if a session is
     already linked, just flip the status. Best-effort: if the session
     insert fails, still mark confirmed so the row doesn't get stuck. */
  const confirmMeeting = async (m) => {
    if (m.session_id) { updateMeeting(m.id, { status: 'confirmed' }).catch(() => {}); return }
    const isGroup = m.subject_type === 'group'
    try {
      const session = await addSession({
        date: m.scheduled_at,
        summary: null,
        notes: null,
        client_id: isGroup ? null : m.subject_id,
        group_id: isGroup ? m.subject_id : null,
        subject_type: m.subject_type,
        subject_id: m.subject_id,
        num: sessionNum(m),
      })
      await updateMeeting(m.id, { status: 'confirmed', session_id: session.id })
    } catch {
      updateMeeting(m.id, { status: 'confirmed' }).catch(() => {})
    }
  }
  const skipMeeting = (m) => {
    /* Didn't happen: its linked expense shouldn't post, and any session we
       materialised for it must be removed (defensive — pending rows have
       no session yet, but a re-reviewed confirmed row might). */
    const linked = linkedTxsForMeeting(m)
    updateMeeting(m.id, { status: 'skipped', session_id: null }).catch(() => {})
    if (m.session_id) removeSession(m.session_id)
    for (const tx of linked) setTxStatus(tx.id, 'skipped')
  }
  const confirmTx = (tx) => setTxStatus(tx.id, 'confirmed')
  const skipTx = (tx) => setTxStatus(tx.id, 'skipped')
  const deleteTx = (tx) => removeTransaction(tx.id)

  if (!pending.length) {
    return <p className="h-card-empty" style={{ margin: '4px 2px' }}>{t('widgets.meetingConfirm.empty')}</p>
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
                <button type="button" className="mtg-confirm-btn approve" onClick={() => confirmMeeting(m)} aria-label={t('widgets.meetingConfirm.meetingHappened')}>
                  <Check size={15} strokeWidth={2} aria-hidden="true" />
                </button>
                <button type="button" className="mtg-confirm-btn skip" onClick={() => skipMeeting(m)} aria-label={t('widgets.meetingConfirm.meetingSkipped')}>
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
                      {cat ? (
                        <>
                          <span className="mtg-confirm-tx-dot" style={{ background: cat.color || 'var(--stone)' }} />
                          {cat.name}
                        </>
                      ) : t('widgets.meetingConfirm.linkedExpense')}
                    </p>
                  </div>
                  <div className="mtg-confirm-actions">
                    <button type="button" className="mtg-confirm-btn approve" onClick={() => confirmTx(tx)} aria-label={t('widgets.meetingConfirm.txPaid')}>
                      <Check size={15} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button type="button" className="mtg-confirm-btn skip" onClick={() => skipTx(tx)} aria-label={t('widgets.meetingConfirm.txNotPaid')}>
                      <X size={15} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button type="button" className="mtg-confirm-btn delete" onClick={() => deleteTx(tx)} aria-label={t('widgets.meetingConfirm.txDelete')}>
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
