# Migrations — what is applied, and what is authoritative

This directory holds 116 numbered migrations, `0001` → `0116`. They are the
*history* of how the schema got here. They are **not** a set you can replay from
scratch: migrations `0001`–`0099` were run as raw SQL and the base tables were
created by hand before any of them, so nothing in this directory creates
`clients`, `transactions`, `tasks` or the other core tables.

If you need to build a database, use **`../schema.sql`**. That file is generated
from the live database and it runs.

## The source of truth is this file, not the database

The database has its own history table, `supabase_migrations.schema_migrations`.
**Do not trust it.** As of 2026-08-27 it holds 14 rows against 111 migrations,
and it is wrong in three separate ways:

- It only started recording at `0100`. Everything before that was applied with
  `supabase db query --linked -f`, which does not write a history row.
- Its `version` values are timestamps (`20260729082323`), and its `name` values
  mostly do not match the filenames here — `0103` alone appears as five separate
  rows (`purge_trash_catalog_guards`, `report_tallies_reset_own`,
  `clients_stamp_status_no_insert`, `snapshots_fill_missing_only`,
  `drop_old_snapshot_overloads`), because it was applied in pieces and
  consolidated into one file afterwards.
- **`0107` is missing from it although `0107` is applied.** All five RPCs it
  locks down are present in the database.

The table is decorative here. It is not read by anything, this project has no
`config.toml` and is not linked, and no command in the workflow consults it. It
was left untouched on purpose (owner decision, 2026-08-27): inventing rows to
make a table look tidy, when nothing reads that table, adds a second thing to
keep in sync without buying anything.

## Applied status

| Migrations | Status |
| --- | --- |
| `0001` – `0108` | **applied** |
| `0109_mcp_tokens` | **applied** 2026-10-11 (rewritten before its first run; recorded as `20261011070819 0109_mcp_tokens`) — the personal Claude access feature: one new table `mcp_tokens` (per-user read-only token stored as a SHA-256 hash, opt-in data categories, 90-day expiry, consent record: `consent_version`, `consented_at`, `first_consented_at`, `consented_categories`), its consent-guard trigger, and the service-role-only functions `mcp_token_issue` / `mcp_token_update_categories`. Purely additive: no existing table, column or row touched. Verified after the run: all 13 columns / 8 constraints / 4 indexes / trigger present; RLS on with 0 policies; no table privilege for `anon` / `authenticated` / `PUBLIC`, EXECUTE on the three functions for `service_role` only; 0 rows; security advisor's only new line is the expected `rls_enabled_no_policy` on `mcp_tokens`; both functions executed without column ambiguity (rolled-back probe, then both `update_categories` branches on test users); live isolation tests of `claude-mcp` against two throw-away test users all passed and every row they created was removed |
| `0110`, `0111` | **applied** |
| `0112_retire_lead_pages` | **applied** 2026-08-27 — unpublished the one legacy lead page (1 row, slug `bnaya`); the row itself is untouched |
| `0113_rls_initplan_fk_indexes` | **applied** 2026-08-27 — wrapped `auth.uid()` in 64 policies, added the `app_sessions` FK, added 20 FK indexes. Verified: 79 policies and 8 RESTRICTIVE both unchanged, 424 `app_sessions` rows preserved, advisor clean of `auth_rls_initplan` and `unindexed_foreign_keys` |
| `0114_landing_signup_complete` | **applied** — `landing_events_type_check` carries `signup_complete` |
| `0115_transactions_group_id` | **applied** 2026-09-06 — added the nullable `transactions.group_id` + its partial index. Verified before and after: 148 rows (143 live) unchanged, column `is_nullable = YES`, 0 rows attributed (no backfill, by design), the table's single RLS policy untouched. The advisor's only new line is `unused_index` on the new index, which is what a brand-new index says |
| `0116_import_batch_id` | **applied** 2026-09-07 — added the nullable `import_batch_id` + its partial index to the eleven tables a spreadsheet import writes to (`clients`, `projects`, `leads`, `transactions`, `sessions`, `payment_plans`, `payment_installments`, `client_statuses`, `lead_statuses`, `categories`, `recurring_templates`), so "undo the import" is one indexed predicate per table instead of a hunt. Verified before and after: every row count identical (clients 49, projects 43, leads 46, transactions 149, sessions 195, recurring_templates 25, lead_statuses 11, categories 6, client_statuses 4, payment_plans 1, payment_installments 1), all eleven `is_nullable = YES` with `column_default = null`, all eleven indexes present, and `count(import_batch_id) = 0` on every table — nothing that pre-dates this migration can ever be matched by an undo. No backfill, by design: the imports that already happened were never grouped, so there is nothing truthful to attribute them to. Security advisor clean of anything new |
| `0117_csp_violations` | **applied** — recorded live as `20260909135808 csp_violations`; the `csp_violations` table exists |
| `0118_free_for_all` | **applied** 2026-10-19 — dropped the five inert plan-limit policies from `0075` and the eight helper functions only they used (dependencies checked live first: nothing else referenced them). Applied after the `invoices` function was redeployed without its `billing_enforced()` call (v36). Verified after the run: public policies 79 → 74, RESTRICTIVE 8 → 3, 0 tier policies and 0 of the eight functions left, every `*_own` policy on the five tables intact, row counts unchanged (clients 54, goals 27, projects 46, site_pages 8, booking_pages 4); security advisor shows nothing new. `user_subscriptions` untouched (0 rows) |
| `0119_remove_grow` | **applied** 2026-10-19 — dropped the Grow payment-gateway objects: tables `payment_requests` and `pending_grow_imports`, and the columns `user_integrations.page_code` / `grow_auto_receipt` / `grow_import_enabled`, `transactions.grow_transaction_id`, `booking_pages.require_payment`, `bookings.payment_status` / `payment_deadline` (with their index and check). All were empty and unreferenced (checked live first). Applied after `booking-intake` v10 and `claude-mcp` v2 were redeployed without them (both still `verify_jwt: false`) and the `grow`, `grow-webhook` and `grow-poll` functions were deleted. Verified after the run: 0 Grow tables and 0 Grow columns left; row counts unchanged (bookings 4, booking_pages 4, transactions 162, user_integrations 6); public policies 74 → 72 (the two dropped tables' own); `bookings_no_overlap` intact; the public booking endpoint returns config and slots (200) |

Verified against the live database on 2026-08-27 by object presence: `0107`'s
five count RPCs exist, `0108`'s `scheduled_meetings.duration_minutes` and its
check constraint exist, `0110`'s `goal_entries.goal_id` exists, `0111`'s
`projects.status` exists, and `mcp_tokens` does not exist. Everything at or
below `0107` is additionally covered by `../schema.sql`, which was regenerated
from the live database at that watermark and matches it.

## How to add a migration

Next free number is **`0120`**.

Both commands below need the CLI linked to the project. That is a one-time step,
and the password it asks for is stored by the CLI rather than in any file here:

```bash
supabase link --project-ref rdurkakzyymxhocvhufw
```

```bash
supabase db query --linked -f supabase/migrations/0116_your_change.sql
```

`supabase db push` is **not** used in this project and is not safe here — it
would try to replay files that were never designed to be replayed, against a
database whose base schema does not exist in any of them.

After any migration that changes the schema, regenerate the baseline so the repo
and the database do not drift apart again:

```bash
node supabase/dump-schema.mjs --watermark 0116
```

(`0112` changed data, not schema, so it left `schema.sql` unaffected.)

`schema.sql` is at watermark **`0115`**, regenerated 2026-09-06.

## `archive/`

`archive/_run_all_pending_2026-06.sql` consolidates migrations `0007`–`0012`
into one idempotent script, used once in June 2026 to catch the database up from
the Supabase SQL editor. It duplicates work that the numbered files already do.

It used to sit in this directory, where it read like migration 112 and was one
mis-click away from being run as if it were new. It is kept — it is a true
record of what happened — but out of the numbered sequence. **Do not run it.**
