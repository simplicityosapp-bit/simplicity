# Cross-Screen Communication Bug Scan — 2026-07-18

**Scope:** bugs in *communication between screens* in the Simplicity web app (`apps/web`) —
where an action on one screen fails to reflect on another, or navigation between screens
passes wrong/missing data.

**Method:** architecture mapping → 6 parallel read-only audit agents (by data domain +
navigation + shared UI) → manual verification of each candidate finding against the code →
fix confirmed bugs → this report.

**Status:** COMPLETE — 13 bugs fixed & verified, **+3 more built after your answers** (per-session billing prompt on Home, project-detail lead-pages rewire, report-drill deep-link). 16 files.

**Validation:** `eslint` clean · `vitest run` 317/317 · `vite build` succeeds · `tsc --noEmit` (core) clean · runtime smoke-test in `?mock=1` (Home, Calendar, Settings, Clients, Reports, `/pages/lead` render with **zero console errors**). All work is on the working tree, **not** committed/pushed — see "How to ship" at the bottom.

### Follow-ups built after your answers (2026-07-19)
- **Q1 → done.** Per-session clients now get a one-off **charge prompt** after confirming a meeting on **both** Home surfaces (attention popup + today-tile drill), reusing the Calendar's exact strings/behaviour (`billPerSessionMeeting` helper + `ConfirmModal`). Consistent everywhere.
- **Q2 → done.** Project-detail "lead pages" section now reads the **live** `site_pages` (kind='lead') instead of the deprecated `lead_pages` backup, and both links go to the real `/pages/lead` builder; the builder now accepts `editPageId` in nav-state to open a specific page straight into the editor.
- **Q4 → done.** Report-drill **client** rows now deep-link to `/clients/:id` (that client's drawer) instead of the bare list. (Leads/sessions/tx/tasks have no per-record route, so they still land on their screen — noted below.)
- **Q3** (moon-snapshot provenance) — you said you weren't sure what I meant; left untouched, short explanation in Q3 below.
- **Q5** — confirmed by-design, no change.

### Fixed this session (most-impactful first)
| # | Sev | What was broken | Fix |
|---|-----|-----------------|-----|
| F1 | **High** | Confirming a per-session client's meeting from Home created a billable session; Calendar deliberately doesn't → inconsistent balance / double-charge | Centralized the per-session guard in `confirmScheduledMeeting` |
| S1 | **High** | "ערוך פרטים" saved a stale drawer-open snapshot → silently **reverted** a status/session/paid change made via the drawer's quick-actions | Re-seed the edit form on each open (key includes open-state) |
| N1 | Med | Home "דרושה תשומת לב" navigating rows (open balances, goal-gap, urgent tasks, pending leads) were **dead clicks** | Map `it.target` → route (was checking `it.to`, never set) |
| F2 | Med | Approving a booking created a lead that never appeared on the Leads board until refetch | Invalidate `['leads']` + `['calendarEvents']` after confirm/materialize |
| F3 | Med | `useCalendarEvents` was local state → Home's two copies diverged (dismiss a duplicate, "פגישות היום" chip stayed stale) | Convert to React Query `['calendarEvents']` (staleTime 0) |
| F4 | Med | `useUserQuestions` was local state → new daily question from the launcher didn't reach the Home slider | Convert to React Query `['userQuestions']` |
| F5 | Med | Editing a meeting-type default price didn't refresh client balances (list/drawer/Home/Finance) | Invalidate `['clients']` in `useMeetingTypes.updateType` |
| F6 | Med | Import refreshed only 3 caches → imported sessions/plans invisible until staleTime | Blanket resync after import |
| F7 | Med | "Issue receipt on create" left the new row without its invoice fields → no receipt button, offered duplicate issue | Invalidate `['transactions']` after a successful issue |
| N3 | Low | Closing a deep-linked client drawer left `:id` in the URL (reload re-opened it) | Navigate back to `/clients` on close when deep-linked |
| N4 | Low | Cold `/projects/:id` flashed "not found"; back button stranded the user | Loading gate + back → `/projects` |
| N5 | Low | Settings→Settings navigation didn't open the requested section | Reconcile section/group per navigation |
| F8 | Low | Daily questions created via goal modals could re-order after refetch | Default `order` in `addQuestion` |
| F-L1 | Low | Un-converting a lead via Edit left a dangling `converted_to_client_id` | Clear it, mirroring the drag path |

---

## Architecture notes (established up front)

- App-wide `QueryClient` (`lib/queryClient.js`): `staleTime 60s`, `refetchOnWindowFocus:false`.
  The cache is **shared** across screens, but screens do **not** auto-refetch on navigation —
  correctness depends on each mutation updating the cache correctly.
- Mutation convention: hooks do optimistic `qc.setQueryData(KEY, …)` on their **own** key;
  `invalidateQueries` only on error. **Cross-key invalidation is rare & manual** — the main
  risk surface.
- Client balances derive **client-side** from `['transactions']` + `['sessions']` caches.
- Home aggregates (`lib/homeData.js`) from the same hooks/caches.

---

## Findings

### VERIFIED — to fix

**F1 [HIGH] Confirming a per-session client's meeting behaves differently on Home vs Calendar (double-count risk)**
- Calendar (`screens/calendar/index.jsx:255-259`) guards `billing_mode==='per_session'` → only flips status; the session is logged separately via the explicit `billSession` prompt (`:275-289`). The two Home surfaces call `confirmScheduledMeeting` **unconditionally** → insert a billable session:
  - `screens/home/widgets/MeetingConfirmList.jsx:59`
  - `modals/TileDrillModal.jsx:444`
- Helper: `lib/scheduledMeetings.js:173` (`confirmScheduledMeeting` → `addSession`). A per-session client accrues `held × price_per_session`, so the Home path creates a charge the Calendar path deliberately avoids → inconsistent balance depending on where the identical meeting was confirmed (and a genuine double-charge if the coach then also bills it from the calendar).
- **Fix:** centralize the guard in `confirmScheduledMeeting` — add a `clients` param; when the subject is a `per_session` client, skip `addSession` and just flip status. Pass `clients` at all 3 call sites. (Calendar keeps its inline early-return; harmless.)
- **Owner Q:** after the fix, confirming a per-session meeting from Home just marks it confirmed (no auto session/charge), matching the calendar. If you'd rather Home also bill per-session clients, that needs a billing prompt on the Home surfaces (product decision).

**F2 [MED] Approving/materializing a booking creates a lead that never lands in the `['leads']` cache**
- `lib/api/bookings.js:76-140` (`createLeadAndEvent`/`confirmBooking`/`materializeBooking`) inserts a `leads` row + owned `calendar_events` row via direct Supabase inserts. `hooks/useBookings.js:22-43` (`confirm`/`materialize`) only `setQueryData(['bookings'])` — never touches `['leads']`.
- **Repro:** On Home, approve a pending booking (or an `auto_confirm` page auto-materializes silently). Go to Leads within ~60s → the new lead is absent from "בתהליך" until staleTime + remount/reload.
- **Fix:** in `useBookings`, after `confirm`/`materialize` succeed, `qc.invalidateQueries({ queryKey: ['leads'] })` (and optionally `['calendarEvents']` once that hook is React-Query — see F3). `cancel`/`reject` leave the lead by design.

**F3 [MED] `useCalendarEvents` is local `useState`, not shared — two divergent copies on Home**
- `hooks/useCalendarEvents.js` holds per-mount local state (no query key). Home mounts it twice: `AttentionWidget.jsx:63` and `ChipsWidget.jsx:37`. Dismissing a duplicate event in the attention resolver mutates only AttentionWidget's copy; the "פגישות היום" chip (ChipsWidget) stays stale until remount.
- **Fix:** convert `useCalendarEvents` to a React-Query hook keyed `['calendarEvents']` with **`staleTime: 0`** (preserves today's refetch-on-mount used by the Google-sync path) so the two Home widgets share one cache; mutations via `setQueryData`.

**F4 [MED] `useUserQuestions` is local `useState` — Home daily-question slider desyncs (confirmed by 2 agents)**
- `hooks/useUserQuestions.js` is local state. Home mounts two instances: `QuickRow.jsx:51` (launcher) and `InsightsWidget.jsx:39` (daily-question slider). Creating a daily-question-tracked goal via the launcher (`AddGoalModal` → `addQuestion`) updates only QuickRow's copy; the slider never shows the new question until Home remounts.
- **Fix:** convert to React-Query `['userQuestions']` (optimistic `setQueryData`, invalidate on error). Also removes a duplicate fetch Home fires today.

**F5 [MED] Meeting-type default-price edit from the client form never refreshes `['clients']`**
- `hooks/useMeetingTypes.js:49-59` (`updateType` → `applyMeetingTypePrice` writes the new price to every linked client) only signals back via `onPriceApplied`, which the two client-form usages don't pass (`AddClientModal.jsx:109`, `EditClientModal.jsx:494`). Clients list / drawer / Home / Finance keep the old price+balance until refetch. (Settings wires it correctly via `onChanged=refetchClients`.)
- **Fix:** in `updateType`, after `applyMeetingTypePrice`, `qc.invalidateQueries({ queryKey: ['clients'] })` — fixes every caller at the root.

**F6 [MED] Import (`onImported`) refreshes only clients/projects/transactions**
- `screens/settings/index.jsx:911-912` refetches 3 caches, but `lib/onboardingImport.js` bulk-inserts sessions, payment plans/installments, categories, leads, statuses too. Imported sessions/plans stay stale on the client drawer + reports until each key crosses staleTime.
- **Fix:** broaden `onImported` to invalidate the full written set (`['sessions']`, `['payment_plans']`, `['payment_installments']`, `['categories']`, `['leads']`, `['clientStatuses']`, `['leadStatuses']`) — or a blanket `queryClient.invalidateQueries()`.

**F7 [MED] "Issue receipt on create" leaves the new income row without its `invoice_document_*` fields in cache**
- `modals/AddTransactionModal.jsx:145-166`: after `addTransaction` (optimistic pre-issue row) it calls `inv.issueDocument` (server-side updates the row) then only `showToast`; the modal has no `onIssued`, never re-reads `['transactions']`. Finance/list won't show the receipt/WhatsApp affordance and re-opening offers a duplicate issue, until the cache refetches. (Edit-modal path is correct via `onIssued=refetch`.)
- **Fix:** give `AddTransactionModal` an `onIssued` prop wired to the same `refetch`, called after a successful issue; wire it at all mount sites.

**F8 [LOW] Questions created via goal modals omit `order` → slider/list ordering can shift after refetch**
- `modals/AddGoalModal.jsx:106-113` + `modals/EditGoalModal.jsx:146-153` omit `order`; `AddQuestionModal.jsx` sets `order: nextOrder`. After a refetch the new question re-sorts by null order → the slider's "next unanswered" pick can move.
- **Fix:** pass `order: questions.length` in both goal modals.

**F9 [LOW] Moon-glance's persisted 30-day trend depends solely on the Home MoonWidget side effect**
- Only writer of `moon_snapshots` is `screens/home/widgets/MoonWidget.jsx:63-70`. A user who lands directly on `/moon` (or disabled the Home widget) never accumulates today's point → the trend line lags the live ring.
- **Fix:** fire `upsertMoonSnapshot` from moon-glance too (or a shared hook). _Flag — small but a provenance change; recommend, hold for owner._

### Low / data-hygiene

- **F-L1 [LOW]** `EditLeadModal.jsx:82-83` clears `converted_at` but not `converted_to_client_id` when un-converting (drag path clears both, `screens/leads/index.jsx:172-179`). Latent — no display impact today (`isConvertedLead` gates on `converted_at`).
- **F-L2 [LOW/product]** Leads toolbar "דפי לידים" → `navigate(ROUTES.LEAD_PAGES)` which redirects to the generic `/pages` hub (`screens/leads/index.jsx:261`). Functional, but the destination doesn't match the label.

---

## Your answers — resolved

- **Q1 ✅ DONE** — per-session confirm now offers a charge prompt on Home (matches the Calendar).
- **Q2 ✅ DONE** — links wired to the live `/pages/lead` builder; section reads `site_pages`; deep-edit works.
- **Q4 ✅ DONE** — report-drill client rows open the specific client.
- **Q5 ✅ CONFIRMED** — sessions-never-income is intended, no change.

**Q3 — still open (you weren't sure what I meant).** Plain version: the little **30-day confidence trend line** on the מבט-על screen is saved one point per day, but the *only* place that saves today's point is the moon widget **on the Home screen**. So if on some day you open מבט-על directly (or you've hidden the Home moon widget) without passing through Home, that day's dot is missing from the trend — the big % ring is always live and correct, but the historical line can have gaps. One-line fix: also save the point when מבט-על itself is opened. **Want me to?** (Low priority, purely the history chart.)

## Noted but low-value (cleanups, no user-facing bug)

- **`useRecurring`, `useTaskCategories`, `useTaskStatuses`, `useMoonSnapshots`** are still local `useState` (same class as F3/F4). No *active* cross-screen bug today (single/route-separated consumers), so I left them. Converting to React Query pre-emptively would prevent the same trap if a second consumer is ever added.
- **Dead exports:** `usePaymentPlans.editInstallment`/`editPlan` (unused; wouldn't reconcile the linked income tx if wired). Goal-category modals `AddGoalCategoryModal`/`EditGoalCategoryModal`/`GoalCategoryPicker` are imported by no screen.
- **`ProjectQuickRow.jsx:38-42`** comment is stale — it says goal entries use "local component state, not the shared cache," but `useGoalEntries` is now React-Query-backed. Might mean you want the project-scoped "עדכון יעד" CTA back (product call).
- **Deleting a goal-linked daily question** (from Settings/Insights) doesn't warn or unlink the goal that references it via `tracked_by_question_id`; the goal's daily-question progress then freezes. Product decision (warn / unlink / convert to manual?).
- **`booking-pages/index.jsx:45`** reads `location.state.editPageId` but nothing sets it — a harmless dead read (latent trap).

## Scope note

This scan covered the **web app** (`apps/web`), where the react-router + react-query cross-screen mechanics live. The **mobile app** (`apps/mobile`) uses a different navigation/data stack (React Navigation, its own screens) and would need a separate pass — I did **not** audit it. Want me to?

## How to ship

Everything is uncommitted on the working tree (clean `main` before this). To review: `git diff`. To ship, the repo's flow is a short-lived branch → one commit → `git merge --no-ff` → push (the `ship-to-main` skill). I did **not** commit/push — say the word and I'll ship the 13 fixes (or any subset).
