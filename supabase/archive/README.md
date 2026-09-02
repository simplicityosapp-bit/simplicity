# Archive — retired code kept for the record

Nothing here runs. Nothing here deploys. This directory sits **outside**
`supabase/functions/`, deliberately: the Supabase CLI treats every directory
under `functions/` as a deployable slug, so an archived function stored there
would be one blanket `supabase functions deploy` away from coming back to life.

## `lead-intake/`

The public endpoint that served the original Lead Pages (`/lead/<id>`): it
returned a published page's config and accepted submissions, inserting a lead
for the page's owner with the service role.

**Why it is here.** It was deployed, and then deleted from the repo in the commit
that retired the legacy lead-page code — but never removed from the deployment.
That left a public, service-role endpoint live in production with no source under
review: unauditable, and silently breakable by any schema change. This copy was
pulled back out of the deployment before it was deleted, so the code is not lost.

**What replaced it.** `site_pages` (migration 0068) with `kind='lead'`, served by
`site-intake` and rendered by `SitePagePublicScreen`. The `/lead/:pageId` route
was repointed to that engine, so the app stopped calling `lead-intake` well before
this cleanup.

**What it never did.** Not one lead ever arrived through it — every row in `leads`
has a null `page_id`.

**The hole it left open.** The header comment claims the page id is "an
unguessable uuid", but `loadPublishedPage` also resolves a **custom slug**
(added later, comment never updated). The single published row's slug was
`bnaya`, so anyone who guessed it could post leads into the owner's account.
They landed as `pending_review`, so this was a spam vector rather than a data
leak — but it was open to the internet. Migration `0112` unpublished that row,
which the function's own `published = true` filter turns into a hard stop.

**If you ever need this back**, do not redeploy this file. Rebuild it on
`site_pages` — the trust model here (`user_id` taken only from the page row,
honeypot, length caps, per-isolate rate limit) is sound and worth copying, but
the table it reads is the deprecated one.
