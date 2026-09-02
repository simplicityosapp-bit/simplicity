import { useEffect } from 'react'
import { generateRecurringTransactions } from '@simplicity/core'
import i18n from '@simplicity/core/i18n'
import { showToast } from '../lib/toast'

/* WHY THIS RUNS IN THE BROWSER AND NOT ON A CRON
   ────────────────────────────────────────────────────────────────
   scheduled-meetings HAS a nightly cron, and the obvious reading is that this
   engine is missing one. It is not, and the difference is worth writing down
   because it is not visible from the outside.

   Meetings needed the cron because their generator only looks back 14 days:
   an occurrence older than that could never be recovered, so a coach who
   stopped opening the app lost meetings permanently.

   This engine has no lookback at all. Its anchor is the earliest transaction
   for the template — or the template's created_at when there are none — and it
   walks from there to today on every run. A coach away for two months opens the
   app and gets every missed occurrence. Nothing expires.

   The same property makes a failed INSERT self-correcting: the dedup set is
   built from rows that EXIST, so anything that failed to write is simply
   missing a key and gets regenerated on the next pass.

   A cron here would therefore add a second writer of financial rows — and the
   duplicate-income risk that comes with one — to fix a problem that fixes
   itself. Owner decision, 2026-09-02. */

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
      let failed = 0
      try {
        for (const payload of due) {
          try { await addTransaction(payload) } catch { failed += 1 }
        }
        /* One message for the pass, not one per row: a blip that drops five
           inserts is one problem, not five. And the wording says "not yet"
           rather than "lost", because the next run really does regenerate
           them — see the note at the top of this file. Silence here was the
           actual defect: expected income quietly failed to appear, and there
           was no signal anywhere, in the app or in a bug report. */
        if (failed) showToast(i18n.t('components:generateFailed.transactions'), 'error')
      } finally {
        generatingGlobal = false
      }
    })()
  }, [templates, transactions, addTransaction, scheduledMeetings, transactionsLoading, scheduledMeetingsLoading])
}
