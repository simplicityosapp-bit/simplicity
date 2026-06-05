# `admin` edge function — deploy

Backend for the owner-only `/admin` console. Aggregates across **all**
users with the service-role key (RLS bypass), gated server-side to the
owner's email.

## Deploy

```bash
supabase functions deploy admin
```

That's it — **no secrets to set**. `SUPABASE_URL`, `SUPABASE_ANON_KEY`
and `SUPABASE_SERVICE_ROLE_KEY` are injected into every edge function
automatically.

## Security model

- Every request must carry the caller's JWT (`Authorization` header,
  added automatically by `supabase.functions.invoke`).
- The function verifies `getUser().email === 'simplicity.os.app@gmail.com'`
  before any query. Anyone else → **403**.
- The app's table RLS is **never touched**; this is a separate, additive
  world. If the function is down, regular users feel nothing.

## Actions (POST `{ action, ... }`)

| action | params | returns |
|---|---|---|
| `dashboard` | — | headline totals + 12-week signups |
| `users` | — | one row per registered user |
| `feedback_list` | — | all feedback + author email |
| `feedback_update_status` | `{ id, status }` | update one feedback row's status |
| `set_subscriber` | `{ user_id, value }` | flag/unflag a user as a manual subscriber |
| `analytics` | `{ range: week\|month\|all }` | sessions/reflections/funnel/top-10 |

The two writes (`feedback_update_status`, `set_subscriber`) go through the
service-role here so the app's per-user RLS is never widened. `set_subscriber`
merges `preferences.subscription.manual` into the **target** user's own prefs
row; the app ignores that key, so the flagged user's experience is unchanged.

## Note when changing onboarding

`ONBOARDING_STEPS` / `STEP_LABELS` are duplicated here from
`src/lib/preferences.js`. If a step is added/removed there, mirror it
here so the funnel + stage labels stay correct.
