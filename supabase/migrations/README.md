# Migrations — what is applied, and what is authoritative

This directory holds 113 numbered migrations, `0001` → `0113`. They are the
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
| `0109_mcp_tokens` | **NOT applied — deliberately.** See below. |
| `0110`, `0111` | **applied** |
| `0112_retire_lead_pages` | **applied** 2026-08-27 — unpublished the one legacy lead page (1 row, slug `bnaya`); the row itself is untouched |
| `0113_rls_initplan_fk_indexes` | **applied** 2026-08-27 — wrapped `auth.uid()` in 64 policies, added the `app_sessions` FK, added 20 FK indexes. Verified: 79 policies and 8 RESTRICTIVE both unchanged, 424 `app_sessions` rows preserved, advisor clean of `auth_rls_initplan` and `unindexed_foreign_keys` |

Verified against the live database on 2026-08-27 by object presence: `0107`'s
five count RPCs exist, `0108`'s `scheduled_meetings.duration_minutes` and its
check constraint exist, `0110`'s `goal_entries.goal_id` exists, `0111`'s
`projects.status` exists, and `mcp_tokens` does not exist. Everything at or
below `0107` is additionally covered by `../schema.sql`, which was regenerated
from the live database at that watermark and matches it.

### `0109` is not applied, and that is intentional

`0109_mcp_tokens.sql` was merged but never run. How the Claude connector's token
should work is still an open decision — the open points are listed at the top of
`../functions/claude-mcp/index.ts`. Running it early is harmless (an empty,
unreachable table) but pointless, since the matching edge function is not
deployed and the feature is hidden behind a disabled "בקרוב" row.

Leave it alone unless the owner says otherwise. **After it is ever run,
regenerate `../schema.sql`.**

## How to add a migration

Next free number is **`0114`**.

```bash
supabase db query --linked -f supabase/migrations/0114_your_change.sql
```

`supabase db push` is **not** used in this project and is not safe here — it
would try to replay files that were never designed to be replayed, against a
database whose base schema does not exist in any of them.

After any migration that changes the schema, regenerate the baseline so the repo
and the database do not drift apart again:

```bash
node supabase/dump-schema.mjs --watermark 0114
```

(`0112` changed data, not schema, so it left `schema.sql` unaffected.)

## `archive/`

`archive/_run_all_pending_2026-06.sql` consolidates migrations `0007`–`0012`
into one idempotent script, used once in June 2026 to catch the database up from
the Supabase SQL editor. It duplicates work that the numbered files already do.

It used to sit in this directory, where it read like migration 112 and was one
mis-click away from being run as if it were new. It is kept — it is a true
record of what happened — but out of the numbered sequence. **Do not run it.**
