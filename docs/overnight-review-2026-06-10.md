# Overnight deep review — 2026-06-10

Ran a 6-agent deep review (export feature, encryption+consent, schema/RLS, api/hooks, UX/RTL/a11y, React correctness). This file = what I **fixed autonomously** + the **open decisions** to go through together. Everything is on branch `review/overnight-2026-06-10` — **nothing pushed to `main`**.

---

## ✅ FIXED (11 code fixes + 1 ready migration) — build passes

| # | File | Fix |
|---|------|-----|
| 1 | `src/auth/AuthProvider.jsx` | **Clear React Query cache on sign-out.** Same-tab account switch could briefly render the previous user's cached rows. Now `queryClient.clear()` on `SIGNED_OUT`. *(See open item B — consider a hard reload for full robustness.)* |
| 2 | `src/context/CryptoContext.jsx` | **Clear the AES key on logout-by-unmount.** Effect cleanup now calls `clearActiveKey()`, honoring the "key dropped on logout" contract. |
| 3 | `src/screens/onboarding/OnboardingReviewWizard.jsx` | **Focus-steal bug.** An effect with no dep array re-focused the dialog on *every* render → typing in the review rows jumped out after each keystroke. Split into mount-only focus + a properly-scoped keydown listener. |
| 4 | `src/modals/FeedbackModal.jsx` | **Timer leak / setState-after-unmount.** The 1.6s success auto-close `setTimeout` had no cleanup. Now stored in a ref and cleared on unmount. |
| 5 | `src/screens/connections/index.jsx` | **Timer leak.** The 2-step-confirm `discTimer` was never cleared on unmount. Added cleanup. |
| 6 | `src/screens/settings/index.jsx` | **Stale cache after sub-status delete.** The forward delete-with-reassign path never refetched clients/leads (the undo/redo paths did). Reassigned rows kept a deleted `status_id` until staleTime. Added the refetch. |
| 7 | `src/modals/ExportDataModal.jsx` | **Sensitive opt-in persisted across reopen.** The export's sensitive-category checkboxes (decrypted PII) survived close→reopen. Now reset on every open. |
| 8 | `src/screens/insights/index.jsx` | **False "no questions" flash.** Screen ignored `loading`/`error` from `useUserQuestions`, showing the empty state during load. Added loading + error branches. |
| 9 | `src/screens/clients/index.jsx` | **Re-sort on any prefs change.** `sort` memo depended on the whole `prefs` object; now `[prefs?.clientsSort]`. |
| 10 | `src/hooks/useTrash.js` | **One failed table blanked the whole trash drawer.** `Promise.all` → `Promise.allSettled`; shows what loaded, surfaces a soft error. |
| 11 | `LegalModal.css` + `AuthScreen.css` | **Wrong token fallback** `#b15942` → `#B86E52` (the real `--mg-btn-primary-bg-hover`). Cosmetic (token always defined). |
| 12 | `supabase/migrations/0025_fk_indexes.sql` (**NEW, needs you to run**) | 13 missing FK indexes (additive, `IF NOT EXISTS`, safe). See open item E. |

---

## 🟠 OPEN DECISIONS — let's go through these one by one

### TOP PRIORITY

**A. The Supabase 1000-row cap — ✅ RESOLVED 2026-06-11 (commit ed04da8).**
Every list function used `.select()` with **no `.range()`/`.limit()`** → PostgREST silently returned at most 1000 rows. The only paginated code was `encryptionMigration.js`. Impact by table:
- `transactions` — finance totals/charts truncate; the recurring engine's dedup set is built from the capped list → **can generate duplicate pending transactions**.
- `sessions` — session counts, moon engine, "sessions this month", history all undercount.
- `daily_answers` — 5 questions × 365 days hits 1000 in ~200 days → insights trends/heatmaps corrupt.
- `goal_entries`, `tasks`, status logs — similar.
- **The new export** silently truncates a "full backup" for heavy users — worst failure mode.
**Resolution:** chose **uniform pagination**. New `src/lib/api/paginate.js` → `selectAllRows()` loops `.range()` until a short page; applied to all 33 api collection reads (list/listDeleted/range) + the `calendar_events` read in `useCalendarEvents`. Backward-compatible (same return shape; one round-trip for sub-1000-row tables); single-row/count/mutation untouched. This also fixes the **export** truncation and the **truncation-driven duplicate recurring-transaction generation** (the dedup set is now complete). Still open: the separate `UNIQUE(user_id, recurring_id, date)` guard against *concurrent-tab* generation (item G).

**B. Cache-clear on sign-out — is `queryClient.clear()` enough?** I added it (#1). But several hooks (`useGoalEntries`, `useReminders`, `useRecurring`, `useGroupMembers`, statuses…) are `useState`-based, not React Query — they reset only because logout unmounts the tree. The agent's "most robust" suggestion was a hard `window.location` reset on sign-out. **Decision:** keep the cache-clear, or go full hard-reload?

**C. `resetAllUserData()` skips tables.** `src/lib/api/account.js` — "reset all my data" leaves behind: `calendar_events` (synced events reappear), `task_statuses`, `task_categories`, `user_quotes` (clear bugs — added after the function), plus `user_integrations` (OAuth tokens — privacy) and `feedback` (probably intentional). **Decision:** which tables should a reset wipe? *I left this — it's a destructive function + product call.*

**D. `schema.sql` has badly drifted from migrations.** ~6 tables + many columns (calendar/task-taxonomy/lead fields/feedback fields) exist only in migrations 0009/0015/0017–0024, never folded into `schema.sql`. It still declares the dropped `'ghost'` lead status. **A fresh DB (or the EU-migration target) built from `schema.sql` is wrong.** **Decision:** regenerate `schema.sql` from the live DB (`pg_dump --schema-only`). High value given the recent migration.

**E. FK indexes (migration 0025, written + ready).** Review `supabase/migrations/0025_fk_indexes.sql` and run it on the live DB. Biggest wins: `transactions.category_id`/`recurring_id`, `clients.status_id`, `leads.status_id`. All additive + `IF NOT EXISTS`.

### MEDIUM

**F. `daily_answers` duplicate-answer 23505.** Plain `.insert()` against a unique partial index; double-submit / StrictMode / two tabs throws an unfriendly Postgres error (mostly UI-guarded). Insights `submit` has no `catch`. **Decision:** switch to `upsert` (enables "edit today's answer" — a behavior change) + add the catch.

**G. Recurring transactions can duplicate.** `scheduled_meetings` has a `UNIQUE(user,subject,at)` safety net; recurring **transactions** have no `UNIQUE(user_id, recurring_id, date)`, so concurrent generation (two tabs / StrictMode) can create true duplicate pending rows. **Decision:** add the unique partial index (schema change).

**H. `leads.phone` / `leads.notes` are plaintext** while `clients.phone`/`notes` are encrypted. Documented "layer 2" deferral in `docs/ENCRYPTION_PLAN.md`, so not a regression — but an at-rest PII asymmetry. **Decision:** encrypt leads now, or keep deferred?

**I. `sessions` client FK is `ON DELETE CASCADE`.** Purging a client (30-day) cascade-deletes their session history including encrypted notes/summaries. `transactions`/`tasks`/`goals` use SET NULL. **Decision:** should session history outlive a purged client?

**J. Three dead tables.** `client_notes` (unused, **plaintext** `content` — would store therapy notes in clear if revived), `session_attachments` (dead — no Storage bucket wiring exists), `reminder_occurrences` (unimplemented feature). All RLS-correct, 0 rows. **Decision:** drop them, or keep + pre-wire encryption for `client_notes` before any revival.

**K. Google-signup marketing consent lost on a failed OAuth-return write.** `ConsentGate` clears the pending-consent stash in a `.finally()` regardless of success; if `updateUser` fails, privacy/DPA are recovered (via `PolicyUpdateModal`) but the marketing opt-in is dropped. **Decision:** clear stash only on success / have the fallback preserve marketing.

### LOWER (polish / refactor — quick to skim)
- **L.** `encryptionMigration.js` uses offset pagination; keyset (`.gt('id')`) is drift-proof for users editing mid-backfill. (Works today; "full coverage" guarantee is just weaker.)
- **M.** `connections/index.jsx` formats dates with inline `toLocaleDateString` instead of the `lib/dates` helpers → ignores the user's `date_format` pref.
- **N.** `userPreferences` is one JSONB blob with last-write-wins; two fast setting toggles / two tabs can clobber. (Provider already serializes its own writes.)
- **O.** `useClients.removeClient` has **no undo** while every sibling delete does — possibly intentional (client delete is consequential). *I left it for you to confirm.*
- **P.** `useCalendarEvents` writes `calendar_events` directly (bypasses the api `sanitize`/`SERVER_OWNED` guard); route through a thin api module.
- **Q.** Status-log "read old value then update" is a non-atomic check-then-act (audit can drift); better as a DB trigger.
- **R.** `admin` edge function reads `moon_snapshots.reflection` raw — now always a ciphertext `ENC:` blob; it only counts presence (fine) but add a comment so nobody renders it (it's owner-undecryptable by design).
- **S.** `MenuDrawer` slides from the physical **left** (unconventional for RTL — deliberate per its comment).
- **T.** `PolicyUpdateModal` has no focus trap (intentional no-dismiss gate, but keyboard focus can leave it).
- **U.** Theme has two sources of truth (`useTheme` local state + `PrefsApplier` from prefs) → brief flicker risk on a slow prefs write.
- **V.** `MoonWidget` upserts a snapshot on every data change in a session (more writes than the "once/day" intent).
- **W.** The `useState`-based hooks (goalEntries/reminders/recurring/statuses/…) predate React Query → each mount refetches, not shared. Mechanical migration to RQ keys.

---

## ✅ Verified clean (agents checked, no action)
- **RLS coverage is complete** on every user-data table (strongest part of the schema). Append-only logs are SELECT+INSERT only; `user_integrations` is RLS-on/policy-none (service-role token vault) — correct.
- **Encryption choke-point is intact** — no `.from('clients'|'sessions'|'moon_snapshots')` bypasses `encryptRow`/`decryptRow`; CSV import, both exports, calendar matching, account deletion all stay correct. `encryptField` is double-encryption-safe; migration is re-entrant + guarded.
- **Soft-delete filtering + `user_id` scoping** are consistent across all 30 api modules. `if (error) throw` is consistent.
- **Error boundary** exists at root + per-route (resetKey). Async effects use `cancelled`/`reqId` guards. Provider values are memoized. No conditional/out-of-order hooks. Timers/listeners/observers are cleaned up (except the two I fixed).
- **Base `Modal`** has a real focus trap + ESC + restore-focus + scroll-lock. RTL chevron direction is correct throughout. Icon buttons carry `aria-label`. `marketing_consent` defaults `false` in every production path.

*Per-agent full detail (with exact line cites) is available — ask and I'll expand any item.*
