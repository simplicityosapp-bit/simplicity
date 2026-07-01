import { useEffect } from 'react'
import { generateRecurringTransactions } from '@simplicity/core'

/* MODULE-LEVEL latch shared across EVERY mount. This engine mounts on BOTH
   home (AttentionWidget) and finance; a per-mount ref only guarded one, so a
   quick home↔finance navigation could run two passes over the same pre-refetch
   transactions snapshot and fire redundant INSERTs. The DB's unique guard on
   recurring tx (migration 0028) already rejects true duplicates, so this is
   purely an efficiency/noise guard — whichever mount wins materialises the
   rows; the other finds nothing owed on its next run. Same fix as
   useScheduledMeetingsGeneration. */
let generatingGlobal = false

/* Orchestrator — runs the recurring engine when both templates and
   transactions are ready, fires the inserts the engine returns. Pass
   `scheduledMeetings` for 'on_meeting' trigger templates (each
   non-skipped meeting on the linked subject seeds one pending tx).

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
  useEffect(() => {
    if (generatingGlobal) return
    if (transactionsLoading) return
    if (scheduledMeetingsLoading) return
    if (!templates || !transactions) return
    if (!templates.length) return
    const due = generateRecurringTransactions(templates, transactions, new Date(), scheduledMeetings || [])
    if (!due.length) return
    generatingGlobal = true
    ;(async () => {
      try {
        for (const payload of due) {
          try { await addTransaction(payload) } catch { /* non-fatal */ }
        }
      } finally {
        generatingGlobal = false
      }
    })()
  }, [templates, transactions, addTransaction, scheduledMeetings, transactionsLoading, scheduledMeetingsLoading])
}
