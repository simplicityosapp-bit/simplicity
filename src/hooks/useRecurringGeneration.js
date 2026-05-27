import { useEffect, useRef } from 'react'
import { generateRecurringTransactions } from '../lib/recurring'

/* Orchestrator — runs the recurring engine when both templates and
   transactions are ready, fires the inserts the engine returns. Pass
   `scheduledMeetings` for 'on_meeting' trigger templates (each
   non-skipped meeting on the linked subject seeds one pending tx).
   A ref-based latch prevents the in-flight inserts from re-triggering
   the effect through the transactions state mutation. Once all
   inserts settle, the effect runs again, sees nothing owed, exits. */
export function useRecurringGeneration({ templates, transactions, addTransaction, scheduledMeetings }) {
  const generating = useRef(false)

  useEffect(() => {
    if (generating.current) return
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
  }, [templates, transactions, addTransaction, scheduledMeetings])
}
