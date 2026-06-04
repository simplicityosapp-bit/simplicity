# purge-deleted-accounts — deploy & schedule

Permanently deletes accounts whose 30-day grace window has passed.
The browser only *records* the request (`user_preferences.preferences.accountDeletion`);
this function does the real `auth.users` delete (everything cascades from there).

> ⚠️ This is destructive and irreversible. Test on a throwaway account first.

## 1. Deploy the function

```bash
cd mangata-react
supabase functions deploy purge-deleted-accounts
```

## 2. Set the shared secret

Pick a long random string. The scheduler must send it in the `x-cron-secret` header.

```bash
supabase secrets set CRON_SECRET=<random-long-string>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do **not** set them.

## 3. Schedule it daily (pg_cron + pg_net)

Run this once in the Supabase SQL editor. Replace `<PROJECT_REF>` and `<random-long-string>`
with your values (the secret must match step 2).

```sql
-- one-time: enable the extensions (no-op if already enabled)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- run every day at 03:15 UTC
select cron.schedule(
  'purge-deleted-accounts-daily',
  '15 3 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/purge-deleted-accounts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<random-long-string>'
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

To change/remove later: `select cron.unschedule('purge-deleted-accounts-daily');`

> Alternatively, schedule it from the Supabase dashboard → **Integrations → Cron**,
> pointing at this Edge Function and adding the `x-cron-secret` header.

## 4. Verify

Trigger once manually and read the JSON summary:

```bash
curl -X POST 'https://<PROJECT_REF>.functions.supabase.co/purge-deleted-accounts' \
  -H 'x-cron-secret: <random-long-string>'
# → { "ok": true, "scanned": N, "due": M, "deleted": [...], "failed": [] }
```

`scanned` = prefs rows checked, `due` = accounts past the grace window,
`deleted` = user ids actually removed.

## Notes / follow-ups
- **Storage files** (`session_attachments`) are *not* removed by the DB cascade — only the
  rows. If/when attachments use a Storage bucket, add a bucket cleanup here before `deleteUser`.
- The function never accepts a user id from the request — it derives the list from elapsed
  time only, so it can never delete an account that isn't already past its window.
