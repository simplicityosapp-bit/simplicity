# Deep Audit — Settings screen & Onboarding Step 2 (file import)

> Session: comprehensive scan of two areas. Generated during a `/simplicity-fix` deep round.
> Legend — **fix-class**: `TECHNICAL` (clear, no product call) · `DESIGN-TOKEN` (swap to existing token / logical property — authorized to auto-apply) · `PRODUCT` (behavior/feature decision — held for owner) · `DESIGN` (subjective visual — held for owner).
> Execution rule this round: auto-apply `TECHNICAL` + `DESIGN-TOKEN`, one at a time, fully. Hold `PRODUCT` + `DESIGN`.

---

## ⭐ Headline finding — past/held meetings cannot be imported (Onboarding)

**Verified: the file-import has ZERO code path that ever creates a `sessions` row.** A past meeting that already happened therefore cannot enter the system as a held session.

- The import only ever builds: **projects, clients, leads, transactions, recurring_templates, client_statuses, lead_statuses** (`lib/onboardingImport.js` `finalizeOnboardingImport`). The review wizard has only 4 tabs: clients/projects/leads/transactions.
- `SHEET_TYPES` is hard-coded to `['clients','projects','leads','transactions','matrix','ignore']` (`lib/sheetMapper.js:38`) — **no `sessions` type.**
- `insertSession` (`lib/api/sessions.js`) is imported **only** by `hooks/useSessions.js` (in-app manual logger). No import path calls it.
- The client field **`sessions_done` ("פגישות שנעשו") IS parsed** (`sheetMapper.js:67,339`) but then **silently dropped** — `finalizeOnboardingImport` never reads it. A file saying "12 sessions done" creates 0 session rows.

**Schema reality (how a held session ties to money):**
- Money **paid** = confirmed income `transactions` for the client.
- Money **owed/total** = `clients.total_override` OR `clients.sessions × clients.price_per_session` (a purchased *quota* on the client row — NOT the held count).
- Sessions **held** count (the `X/Y` on the client card) = `COUNT(sessions WHERE client_id=…)` — real `sessions` rows (`schema.sql:282-300`, `lib/clients.js:58-63`).

**Owner decision (Q3 answered: "held session + money"). Remaining sub-decision before build — the INPUT FORMAT:**
1. **Per-session ledger** — file has one row per held meeting (with a date). Cleanest data, but needs: new `'sessions'` value in `SHEET_TYPES`/labels/`ENTITY_FIELDS`, a `sessions` branch in `projectSheet`, a new review-wizard tab, content-detection, and the finalizer insert.
2. **Count-only** — file just says "N done" (`sessions_done`). Smaller change (expand N into N `sessions` rows in the finalizer) but **invents dates** (which date? — affects nothing financial since money-owed comes from quota×price, only the held-count display).
3. **Matrix of counts** — monthly grid of session counts per client → needs a "these cells are session counts, not shekels" mapping option + a flatten target.

**Recommended:** support (1) per-session ledger as the primary path (most accurate, real dates), and treat `sessions_done` count (2) as a fallback that creates N undated→synthesized sessions only if the user opts in. **Needs owner sign-off on input format before implementation.** Finalizer insert point: `lib/onboardingImport.js` after clients are created (~line 212, where `clientIdByName` is populated); `sessions.num` is `NOT NULL` so compute a per-client incrementing index; `date` is `NOT NULL`.

---

# SETTINGS SCREEN

## 🔴 Critical

| # | Finding | Location | fix-class |
|---|---|---|---|
| S1 | **Daily-reminder toggle is dead** — `prefs.insightsReminder` is written but `migratePreferences()` strips it on reload (never carried into the rebuilt object), and no notification code ever consumes it. | `settings/index.jsx:508-575`, `lib/preferences.js` migrate | persistence = **TECHNICAL**; the actual push notification = **PRODUCT** |
| S2 | **Date/time/week-start format settings are dead** — only `format.currency` is consumed (PrefsApplier). `date_format`, `time_format`, `week_start` save but are never read anywhere. 3 of 4 controls in "תשלומים ומטבע" do nothing. | `settings/index.jsx:91-101`, `PrefsApplier.jsx:16-18` | **PRODUCT** (wire up vs remove) |

## 🟡 Medium

| # | Finding | Location | fix-class |
|---|---|---|---|
| S3 | **Reset-account can leave a half-wiped inconsistent state** — `onResetAccount` has no try/catch; if `resetAllUserData()` throws mid-way, data is partially deleted AND onboarding is never reset, with no recovery. | `settings/index.jsx:438-442` | **TECHNICAL** (guard + reset onboarding regardless / idempotent retry) |
| S4 | **No loading/error states** for questions, lead sources, client & lead statuses → flash of wrong empty-state while loading; fetch errors fully swallowed (look identical to "empty"). | `settings/index.jsx:421-424,513,727` | **TECHNICAL** (gate empty on `!loading`, surface `error`) |
| S5 | **Add status / add source failures silently swallowed** — `StatusGroups.submit` awaits with no catch; `submitNewSource` uses empty `catch {}`. Failed add looks like a no-op. | `settings/index.jsx:376-381,716-723` | **TECHNICAL** (surface error) |
| S7 | Profile name / role_other commit on **blur only**, no saved indicator — an edit can be lost if the accordion collapses without a blur; user gets no confirmation. | `settings/index.jsx:328-334,355-362` | **TECHNICAL** (commit on close + saved hint) |

## ⚪ Low

| # | Finding | Location | fix-class |
|---|---|---|---|
| S8 | `set-acc-body` hardcodes `padding: 0 16px 16px 64px` — the 64px indent is on the **left**, but in RTL the icon is on the right; should be `padding-inline-start: 64px`. | `SettingsScreen.css:207-209` | **DESIGN-TOKEN** (logical property) |
| S9 | Hardcoded hex/rgba instead of tokens (`#fff`, `#181410`, raw `rgba(...)`, inline `#0e9888`) + `var(--bg-clients,#fff)` copy-paste token leak on `qs-mode`/`qs-save`. | `SettingsScreen.css` (50,266,305,514,536,576…), `index.jsx:720` | **DESIGN-TOKEN** |
| S10 | **Lead-source color non-customizable** — every new source hardcoded `#0e9888`; dot renders `s.color` but no picker UI. Sub-statuses always insert with no color/icon UI. | `index.jsx:720`, `StatusGroups` | **PRODUCT** (half-built feature) |
| S11 | QuestionScheduleEditor "every X days" — input `min="2"` but submit clamps `Math.max(1,…)` and treats `≤1`/NaN as "every day" with no feedback; free-typing invalid values. | `QuestionScheduleEditor.jsx:46-53,88-98` | **TECHNICAL** |
| S12 | Widget drag-reorder is **pointer-only** — grip is `aria-hidden`, rows not focusable, no up/down controls → keyboard/SR users can't reorder. | `index.jsx:184-250` | **PRODUCT** (needs move controls) |
| S13 | Accent swatches: `role="radio"` with only `title` (no `aria-label`); `set-w-toggle` is a `<button>` not `role="switch"`. | `index.jsx:210-222` | **TECHNICAL** (a11y attrs) |
| S6 | Text-size implemented as `.app { zoom }` — non-standard, scales layout not just text; no token handling. | `index.css:32-34`, `PrefsApplier.jsx:31-35` | **DESIGN** (approach) |
| S14 | Three different toggle idioms for identical on/off (pressed-button vs checkbox vs faux-switch); none use `role="switch"`. | `index.jsx:199-206,530-535,557-562` | **DESIGN** (unify) |
| S15 | Reset-account modal copy understates scope — omits that questions, answers, sessions, notes, goal-entries, snapshots are also wiped. | `ResetAccountModal.jsx:48-54` vs `lib/api/account.js:22-34` | **TECHNICAL** (factual copy) |

**Inventory headline:** 4 dead controls (date/time/week-start + daily-reminder), 1 buggy critical flow (account reset partial-failure), systemic missing loading/error states across the 4 list-backed sections. Widget/theme/gender/currency/goals-shortcut/export/import/status-CRUD are genuinely wired.

---

# ONBOARDING — STEP 2 (file import)

## 🔴 Critical

| # | Finding | Location | fix-class |
|---|---|---|---|
| O1 | **Held/past sessions cannot be imported at all** (see Headline). | `lib/onboardingImport.js`, `sheetMapper.js:38` | **PRODUCT** then technical |
| O2 | **Parsed `sessions_done` is silently discarded** — "פגישות שנעשו" parsed into `client.sessions_done` then never consumed. | `sheetMapper.js:339` → `onboardingImport.js` | **PRODUCT** (map to quota / generate sessions / drop) |

## 🟡 Medium

| # | Finding | Location | fix-class |
|---|---|---|---|
| O3 | `ROW_CAP=500` caps flat-CSV rows but the multi-sheet xlsx path is uncapped — inconsistent; big workbook bloats the prefs JSONB. | `lib/csvImport.js:54,360`; `Step2DataImport.jsx:43-53` | **TECHNICAL** (consistent cap + surface) |
| O4 | `truncated` warning is dead for the multi-sheet flow — wizard reads `parsed.truncated` but Step2 builds `sheets[]` with no top-level `truncated`. | `OnboardingReviewWizard.jsx:346-351` | **TECHNICAL** |
| O5 | Imported "paid" amounts dated **today**, not the real payment date → historical income lands in current month, skews reports. | `onboardingImport.js:233-251` | **PRODUCT** (date source) |
| O6 | Transactions with bad/blank date are **dropped** even with a valid amount → revenue under-imports silently. | `onboardingImport.js:296-298`; `csvImport.js:292` | **PRODUCT** (fallback date vs drop) |
| O7 | **Two divergent importer engines coexist** — `MultiSourceImporter`+`lib/multiImport.js` vs `UnifiedSheetImporter`+`lib/sheetMapper.js`; Step2 only mounts the latter. Risk of fixing the wrong one. | `MultiSourceImporter.jsx`, `Step2DataImport.jsx:6` | **TECHNICAL** (verify dead → remove/document) |
| O8 | `THIS_YEAR = 2026` hard-coded in 3 files — matrix year list frozen; breaks in 2027+. | `MultiSourceImporter.jsx:22`, `UnifiedSheetImporter.jsx:27`, `PivotMappingEditor.jsx:29` | **TECHNICAL** |
| O9 | Duplicate "מעבד את הקובץ…" busy hint rendered twice simultaneously. | `Step2DataImport.jsx:148,151` | **TECHNICAL** |
| O10 | `parseCsvFile(file)` called **twice** in one expression → whole file parsed/decoded twice, risks divergence. | `Step2DataImport.jsx:40-41` | **TECHNICAL** |
| O11 | Transaction-amount synonym list maps `paid/שולם/סהכ` → could double-count income on mixed sheets in the flat-CSV engine (sheetMapper guards via `hasDateColumn`, csvImport doesn't). | `csvImport.js:100` | **TECHNICAL** (align guard) |

## ⚪ Low

| # | Finding | Location | fix-class |
|---|---|---|---|
| O12 | Dead imports `CheckCircle2`, `isr`. | `MultiSourceImporter.jsx:2-4` | **TECHNICAL** |
| O13 | Matrix one-off rows with no year flatten to dateless → dropped; confirm should be blocked, not just advance. | `pivotImport.js:178`; `Step2DataImport.jsx:107` | **TECHNICAL** |
| O14 | Two status-mapping codepaths can classify the same Hebrew status differently. | `csvImport.js:117` vs `statusImport`/`columnDetect` | **TECHNICAL** (consolidate) |
| O15 | `looksName` Hebrew range `[֐-׿]` includes non-letter codepoints. | `columnDetect.js:106` | **TECHNICAL** (narrow to `א-ת`) |
| O16 | CSV parser not RFC4180-complete (mid-field quotes, leading whitespace). | `csvImport.js:198-229` | **PRODUCT** (accept vs lib) |
| O17 | Review-wizard tabs lack `role="tabpanel"`/`aria-controls`. | `OnboardingReviewWizard.jsx:322-334` | **TECHNICAL** (a11y) |
| O18 | Hidden file `<input>` has no `aria-label`. | `Step2DataImport.jsx:139-146` | **TECHNICAL** (a11y) |
| O19 | Mixed Hebrew+Latin/number samples may bidi-reorder without isolation. | `UnifiedSheetImporter.jsx:138`, `CsvMappingEditor.jsx:62` | **DESIGN-TOKEN** (`<bdi>`/`dir="auto"`) |
| O20 | Step2 error color via inline `var(--clay)` style instead of an error class. | `Step2DataImport.jsx:149` | **DESIGN-TOKEN** |

**Verified strengths (not issues):** encoding fallback UTF-8→win-1255 + BOM strip; Excel serial-date & merged-cell handling; robust money parser (accounting negatives, he/eu decimals); IL day-first date parsing w/ calendar validation; double-import ref guard; DB-snapshot dedup on re-import.

---

## Round outcome

### ✅ Shipped (technical + token-grounded), each verified by a green build
- **Settings:** S4/S5 (loading + error states, surfaced add failures) · S3 (reset resets onboarding in `finally`) · S15 (modal copy lists all wiped data) · S7 (profile commits on collapse + saved hint) · S11 (schedule "every X" floors at 2) · S13 (toggle `role=switch`, swatch `aria-label`) · S1 (migratePreferences preserves extra top-level prefs — also fixed latent leadsView/financeShowSkipped/tileFilters stripping) · S8 + clear subset of S9 (`padding-inline-start`; `--bg-clients` leak → `--cream`).
- **Onboarding:** O8 (year from `getFullYear()`) · O9/O10 (single parse, one busy hint) · O15 (name regex) · O17 (tabpanel a11y) · O18 (file-input aria-label) · O19 (`<bdi>` on dynamic header/sample) · O3/O4 (cap + flag oversized sheets) · O13 (already enforced via `canAdvance`) · O7 (removed dead MultiSourceImporter + PivotMappingEditor).

### ⏸️ Held — NOT changed autonomously
- **PRODUCT (owner decision):**
  - **O1 + O2 — past/held-meetings import (HEADLINE).** Owner chose "held session + money" representation; still needs the **input-format** sign-off (per-session ledger vs count-only vs matrix) before build. See top of doc for exact insert points.
  - O5 (imported-paid date source), O6 (dateless-transaction drop policy), O16 (CSV RFC4180).
  - S2 (dead date/time/week-start settings — wire vs remove), S10 (source/status colour-picker UI), S12 (widget-reorder keyboard a11y), S1-notification (actual push), S6 (text-size `zoom` approach).
- **DESIGN (subjective):** S14 (unify toggle idioms), remaining S9 hex (`#181410` contrast text etc. — no clean token; needs a mapping pass), O20 (Step2 error is already token-grounded inline; class refactor is cosmetic).
- **Deferred for safety (would alter import parsing of real financial data — verify before changing):** O11 (amount-synonym double-count guard alignment), O14 (consolidate the two status mappers).
