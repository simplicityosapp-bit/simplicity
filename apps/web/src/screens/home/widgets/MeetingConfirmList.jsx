import { useMemo } from 'react'
import { Check, X, Trash2 } from 'lucide-react'
import { useClients } from '../../../hooks/useClients'
import { useGroups } from '../../../hooks/useGroups'
import { useScheduledMeetings } from '../../../hooks/useScheduledMeetings'
import { useSessions } from '../../../hooks/useSessions'
import { useTransactions } from '../../../hooks/useTransactions'
import { useRecurring } from '../../../hooks/useRecurring'
import { useCategories } from '../../../hooks/useCategories'
import { pendingMeetingsToReview, confirmScheduledMeeting, skipScheduledMeeting } from '../../../lib/scheduledMeetings'
import { isr } from '../../../lib/finance'
import { formatWhen } from '../../../lib/dates'
import { toDateKey } from '../../../lib/recurring'
import { useT } from '../../../i18n/useT'
import { Box, Txt, Btn } from '../../../components/ui'

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

  /* Confirming "it happened" materialises a real session and links it via
     scheduled_meetings.session_id (see confirmScheduledMeeting). The calendar
     event-details flow shares the same helper so both surfaces update the
     client/group card identically. */
  const confirmMeeting = (m) => confirmScheduledMeeting({ meeting: m, sessions, addSession, updateMeeting })
  const skipMeeting = (m) => {
    /* Didn't happen: its linked expense shouldn't post, and any session we
       materialised for it is dropped by skipScheduledMeeting. */
    const linked = linkedTxsForMeeting(m)
    skipScheduledMeeting({ meeting: m, updateMeeting, removeSession })
    for (const tx of linked) setTxStatus(tx.id, 'skipped')
  }
  const confirmTx = (tx) => setTxStatus(tx.id, 'confirmed')
  const skipTx = (tx) => setTxStatus(tx.id, 'skipped')
  const deleteTx = (tx) => removeTransaction(tx.id)

  if (!pending.length) {
    return <Txt as="p" className="h-card-empty" style={{ margin: '4px 2px' }}>{t('widgets.meetingConfirm.empty')}</Txt>
  }

  return (
    <Box className="h-card-list">
      {pending.map((m) => {
        const linkedTxs = linkedTxsForMeeting(m)
        return (
          <Box key={m.id} className="mtg-confirm-row">
            <Box className="mtg-confirm-head">
              <Box className="mtg-confirm-main">
                <Txt as="p" className="mtg-confirm-name">{subjectName(m)}</Txt>
                <Txt as="p" className="mtg-confirm-when">{formatWhen(m.scheduled_at)}</Txt>
              </Box>
              <Box className="mtg-confirm-actions">
                <Btn type="button" className="mtg-confirm-btn approve" onClick={() => confirmMeeting(m)} aria-label={t('widgets.meetingConfirm.meetingHappened')}>
                  <Check size={15} strokeWidth={2} aria-hidden="true" />
                </Btn>
                <Btn type="button" className="mtg-confirm-btn skip" onClick={() => skipMeeting(m)} aria-label={t('widgets.meetingConfirm.meetingSkipped')}>
                  <X size={15} strokeWidth={2} aria-hidden="true" />
                </Btn>
              </Box>
            </Box>

            {linkedTxs.map((tx) => {
              const cat = tx.category_id ? (categories || []).find((c) => c.id === tx.category_id) : null
              return (
                <Box key={tx.id} className="mtg-confirm-linked">
                  <Box className="mtg-confirm-main">
                    <Txt as="p" className="mtg-confirm-tx-desc">
                      <Txt className="mtg-confirm-tx-amt mono">−{isr(tx.amount)}</Txt>
                      {tx.desc ? ' · ' + tx.desc : ''}
                    </Txt>
                    <Txt as="p" className="mtg-confirm-tx-meta">
                      {cat ? (
                        <>
                          <Txt className="mtg-confirm-tx-dot" style={{ background: cat.color || 'var(--stone)' }} />
                          {cat.name}
                        </>
                      ) : t('widgets.meetingConfirm.linkedExpense')}
                    </Txt>
                  </Box>
                  <Box className="mtg-confirm-actions">
                    <Btn type="button" className="mtg-confirm-btn approve" onClick={() => confirmTx(tx)} aria-label={t('widgets.meetingConfirm.txPaid')}>
                      <Check size={15} strokeWidth={2} aria-hidden="true" />
                    </Btn>
                    <Btn type="button" className="mtg-confirm-btn skip" onClick={() => skipTx(tx)} aria-label={t('widgets.meetingConfirm.txNotPaid')}>
                      <X size={15} strokeWidth={2} aria-hidden="true" />
                    </Btn>
                    <Btn type="button" className="mtg-confirm-btn delete" onClick={() => deleteTx(tx)} aria-label={t('widgets.meetingConfirm.txDelete')}>
                      <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                    </Btn>
                  </Box>
                </Box>
              )
            })}
          </Box>
        )
      })}
    </Box>
  )
}
