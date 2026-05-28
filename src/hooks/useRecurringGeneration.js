import { useEffect, useRef } from 'react'
import { generateRecurringTransactions } from '../lib/recurring'

/* Orchestrator — runs the recurring engine when both templates and
   transactions are ready, fires the inserts the engine returns. Pass
   `scheduledMeetings` for 'on_meeting' trigger templates (each
   non-skipped meeting on the linked subject seeds one pending tx).
   A ref-based latch prevents the in-flight inserts from re-triggering
   the effect through the transactions state mutation. Once all
   inserts settle, the effect runs again, sees nothing owed, exits.

   IMPORTANT: gating on `transactionsLoading` (and the optional
   `scheduledMeetingsLoading`) keeps the engine from firing during
   the initial fetch — otherwise the empty default arrays look like
   "no rows exist yet" and we cheerfully create duplicate pending
   transactions for every cadence slot. Same root cause as the
   scheduled-meetings dedup bug. */
export function useRecurringGeneration({
  templates, transactions, addTransaction, scheduledMeetings,
  transactionsLoading, scheduledMeetingsLoading,
}) {
  const generating = useRef(false)

  useEffect(() => {
    if (generating.current) return
    if (transactionsLoading) return
    if (scheduledMeetingsLoading) return
    if (!templates || !transactions) return
    if (!templates.length) return
    const due = generateRecurringTransactions(templates, transactions, new Date(), scheduledMeetings || [])
    if (!due.length) return
    generating.current = true
    ;(async () => {
      for (const payload of due) {
        try { await addTransaction(payload) } catch { /* non-fatal */ }
      }
      generating.current = false
    })()
  }, [templates, transactions, addTransaction, scheduledMeetings, transactionsLoading, scheduledMeetingsLoading])
}
