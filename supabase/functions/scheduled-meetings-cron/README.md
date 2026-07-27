# scheduled-meetings-cron — deploy & schedule

Materialises recurring `scheduled_meetings` for coaches who are **not** currently
using the app.

## Why it exists

Generation has always run client-side (`HomeGenerators` + the calendar screen),
over a `now − 14d → now + 4w` window. That works while a coach has the app open
and does nothing at all while they don't — and because the lookback is only 14
days, every occurrence older than that is **lost for good** once they return.

Two beta accounts had no `app_sessions` row at all: their weekly meetings simply
stopped being created in June. Running the same engine nightly means the 14-day
window never lapses, so a gap can't form in the first place.

> It is a safety net, not a replacement. The client-side hook stays — it is the
> fast path that materialises a slot the moment a coach sets it.

## One implementation, on purpose

The rules come from `packages/core/src/domain/scheduledMeetings.ts` — the very
module the browser runs. **Do not re-implement them here.** Two copies is exactly
how `recurring_start_date` / `recurring_end_date` came to be honoured nowhere
while sitting in the schema and in every add/edit form.

That module deliberately **imports nothing**, which is what lets the deploy
bundle it: Deno resolves relative imports strictly, and the rest of
`packages/core` is written extensionless (`./dates`), with `domain/dates.ts`
reaching into `../i18n`. A probe deploy that pulled in `dates.ts` failed with:

```
Module not found ".../packages/core/src/i18n"
  at packages/core/src/domain/dates.ts:5
```

Adding an import to that module will break this deploy, silently, until the next
time someone runs it.

## Time zone

Occurrences are computed against an **explicit** IANA zone (default
`Asia/Jerusalem`), not the runtime's clock. This is not optional here: the Edge
runtime is pinned to UTC and refuses to change —

```
Deno.env.set('TZ', 'Asia/Jerusalem')  →  NotSupported: The operation is not supported
```

— so a `setHours`-based engine would have written a 09:30 slot as `09:30Z`,
which Israel reads as 12:30. The function also refuses to write at all if the
runtime can't resolve the zone: a build missing ICU data silently answers UTC
rather than failing, and that would put every meeting hours off.

## 1. Deploy

```bash
supabase functions deploy scheduled-meetings-cron --no-verify-jwt
```

`--no-verify-jwt` is required: pg_cron posts with the shared secret and no JWT,
so with verification on, the gateway 401s the call before this function runs.
The `x-cron-secret` check inside the function is the real gate.

## 2. Secret

```bash
supabase secrets set MEETINGS_CRON_SECRET=<random-long-string>
```

Its own secret rather than the purge cron's `CRON_SECRET`: the CLI only ever
shows a *digest*, so a shared secret can't be read back to verify a run, and
rotating one job's key would silently break the other's schedule.

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do
**not** set them.

## 3. Dry run first

Always. It computes everything and writes nothing.

```bash
curl -X POST 'https://<PROJECT_REF>.functions.supabase.co/scheduled-meetings-cron' \
  -H 'content-type: application/json' \
  -H 'x-cron-secret: <secret>' \
  -d '{"dryRun":true}'
```

```jsonc
{
  "ok": true, "dryRun": true, "timeZone": "Asia/Jerusalem",
  "users": 4,        // coaches who own at least one recurring subject
  "owed": 17,        // rows the engine says are missing
  "created": 0,      // always 0 on a dry run
  "alreadyThere": 0, // unique-index hits: the coach's browser won the race
  "failed": 0,
  "perUser": [{ "user_id": "…", "owed": 10, "created": 0, "sample": ["2026-07-22T16:45:00.000Z"] }]
}
```

Read `sample` in the coach's zone, not UTC — `16:45Z` is 19:45 in Israel.

## 4. Schedule it daily (pg_cron + pg_net)

Run once in the SQL editor. The existing jobs sit at 03:00 and 03:15 UTC.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'scheduled-meetings-daily',
  '30 3 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/scheduled-meetings-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<secret>'
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

Change or remove later: `select cron.unschedule('scheduled-meetings-daily');`

## What it will and won't do

- **Only ever INSERTs.** It never updates or deletes, so a confirmed or skipped
  meeting can't be disturbed by a nightly run.
- **No backfill.** It uses the same 14-day lookback as the browser, so it closes
  the gap going forward rather than resurrecting months of history (owner's call,
  2026-07-27). Occurrences already missed before the cron existed stay missed.
- **Meetings only.** It does not run the recurring-*transaction* engine: money
  should not appear while nobody is watching. Those are still created by the
  browser when the coach next opens the app.
- **Every coach**, no opt-in toggle — it only materialises what the app would
  have created anyway, with no external API cost and no billing attached.
- Rows go in **one at a time**: a bulk insert is rejected whole if a single row
  trips the partial unique index on pending meetings, which happens whenever the
  coach's own browser materialised the same slot moments earlier. `23505` is
  counted as `alreadyThere`, not as a failure.
- Every read **pages** — this function reads across all users, and the 1000-row
  PostgREST cap has bitten this codebase before.
