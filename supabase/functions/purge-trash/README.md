# purge-trash — deploy & schedule

Permanently removes soft-deleted rows once the trash has stopped showing them.

## Why it exists

The trash lists items deleted in the last 30 days and offers restore. After 30
days an item drops off the list and can never be restored — but **nothing ever
removed it**, so it sat in the database indefinitely while the guide claimed a
permanent deletion that never happened. (The copy was corrected first, in
`307d5e2c`; this makes the original promise true.)

Account-level deletion is a different job: `purge-deleted-accounts` wipes whole
accounts via `admin.deleteUser()`. This one is per-row, inside a live account.

## Why reports don't move

Metrics used to be recounted off the live tables, so deleting a row rewrote
history — the bug a beta user reported (`acbbeaa5`). They now read:

- **flow metrics** (inquiries, closes, conversions, new clients, sessions,
  completed tasks, churn) from `report_tallies`, written by triggers at the
  moment the event happens — migration `0100`;
- **the two "as of" snapshots** from one frozen value per closed month —
  migration `0101`.

Verified on the first real run (2026-07-29): 562 rows deleted, and every tally
on the owner's account came out byte-identical. 37 task rows went and June still
reported 47 completed.

The function therefore **always freezes the closed month before deleting**, even
on a dry run. A counter is already row-independent; a snapshot only exists once
someone freezes it, so purging first would lose that month's "active clients at
the end" for good.

## The guard — read this before changing anything

It is **not** `delete where deleted_at < now() - 30 days`. Soft-deleted parents
are still wired to LIVE children, and several of those foreign keys are
`ON DELETE CASCADE`:

```
clients  → sessions, group_members, payment_plans, client_adjustments
groups   → sessions, group_members
projects → groups
```

The first dry run proved the danger: a client deleted in June still owned a
**live** session, which a naive sweep would have destroyed. The rest are
`SET NULL`, which mutates a live row instead of deleting it — quieter, equally
wrong.

So a row is purged only when **nothing live still points at it**. Anything
referenced is skipped and reconsidered next run, converging as its children go.
On the first run: 562 purged, 13 skipped.

The test is **generated from `pg_constraint`** (`purge_trash_guard`), not
hand-written — writing it by hand got three column names wrong on the first
attempt. A foreign key added later is respected without editing anything.

Pure log children (`lead_status_log`, `client_status_log`) are exempt and
cascade with their parent: they have no independent life and are invisible on
their own.

## 1. Deploy

```bash
supabase functions deploy purge-trash --no-verify-jwt
```

`--no-verify-jwt` is required: pg_cron posts with the shared secret and no JWT,
so with verification on, the gateway 401s before this function runs. The
`x-cron-secret` check inside is the real gate.

## 2. Secret

```bash
supabase secrets set PURGE_TRASH_SECRET=<random-long-string>
```

Its own secret, not `CRON_SECRET`: the CLI only ever shows a *digest*, so a
shared secret can't be read back to verify a run, and rotating one job's key
would silently break another's schedule. Same reasoning as
`MEETINGS_CRON_SECRET`.

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do
**not** set them.

## 3. Dry run first

Always. Dry run is also the default: deleting needs an explicit
`{"dryRun":false}`, so a mis-fired call is inert.

```bash
curl -X POST 'https://<PROJECT_REF>.functions.supabase.co/purge-trash' \
  -H 'content-type: application/json' \
  -H 'x-cron-secret: <secret>' \
  -d '{"dryRun":true}'
```

```jsonc
{
  "dryRun": true,
  "days": 30,
  "snapshottedThrough": "2026-06-01", // the closed month that was frozen
  "totalPurged": 562,                 // what it WOULD remove
  "totalSkipped": 13,                 // still referenced by something live
  "tables": [{ "table_name": "transactions", "purged": 169, "skipped": 0 }]
}
```

`days` is clamped to a minimum of 30 — below that it would delete something a
user can still see and restore.

## 4. The schedule — ALREADY LIVE, and it does not use this function

`purge-trash-daily` runs at **03:45 UTC** and calls the SQL directly:

```sql
select cron.schedule(
  'purge-trash-daily',
  '45 3 * * *',
  $$
  select public.report_snapshot_backfill();
  select public.purge_trash(p_dry_run => false, p_days => 30);
  $$
);
```

The logic already lives in the database, so posting to the edge function would
only add an HTTP hop, a secret to rotate, a deploy step, and three more ways to
fail silently at 03:45. Steps 1–2 above are therefore **optional** — the
schedule works without deploying anything.

`03:45` keeps it clear of the three existing jobs and puts it **after** them
(`invoice-poll` 03:00, `purge-deleted-accounts` 03:15, `scheduled-meetings`
03:30): an account purged at 03:15 takes its rows with it, so there is nothing
left here to sweep.

Verified when scheduled: the job runs as `postgres`, which holds EXECUTE on
both functions (they are `SECURITY DEFINER` with EXECUTE revoked from
`anon`/`authenticated`), and the exact command string above was run by hand
first — 0 purged, 13 correctly skipped.

Check, pause or remove it:

```sql
select jobname, schedule, active from cron.job order by schedule;
select * from cron.job_run_details where jobid =
  (select jobid from cron.job where jobname='purge-trash-daily')
  order by start_time desc limit 5;

update cron.job set active = false where jobname = 'purge-trash-daily';  -- pause
select cron.unschedule('purge-trash-daily');                             -- remove
```

### When the edge function is still worth deploying

Only if you want to trigger or inspect a sweep from outside the database — an
ops dashboard, a manual "clean up now" button, a monitored HTTP check. It
returns the same per-table report as JSON and defaults to a dry run. Nothing
depends on it.

## Running it by hand

The SQL function is callable directly, which is how the first run was done:

```sql
select public.report_snapshot_backfill();          -- freeze first, always
select * from public.purge_trash(p_dry_run => true) where purged > 0 or skipped > 0;
```

Pass `p_dry_run => false` to delete. Both functions are `SECURITY DEFINER` with
`EXECUTE` revoked from `anon`/`authenticated`, so only the service role reaches
them.
