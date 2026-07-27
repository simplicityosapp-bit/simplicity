-- ════════════════════════════════════════════════════════════════
-- Migration 0099 — Security Advisor, round 2
-- Date: 2026-07-26
-- ════════════════════════════════════════════════════════════════
-- Second pass over the Supabase Security Advisor, following 0045. Everything
-- here is hardening only: no behaviour change, no data change, re-running is
-- a no-op. The findings that are NOT fixed are listed at the bottom WITH the
-- reason, so the next advisor run doesn't re-open a closed decision.
--
--   1) Function Search Path Mutable — the two functions 0045 didn't cover
--      (they were written after it). Same treatment: pin `search_path = ''`.
--
--   2) "anon Can Execute SECURITY DEFINER Function" (lint 0028) — nine helper
--      functions. EVERY policy that references them is `TO authenticated`
--      (verified against schema.sql), and the only client-side RPC call
--      (`is_reserved_display_name`, communityProfiles.js) runs signed-in. So
--      `anon` needs none of them → revoke.
--      ⚠️ `authenticated` KEEPS execute, deliberately. RLS policy expressions
--      are evaluated as the querying user and DO get an EXECUTE privilege
--      check — revoking would turn every gated INSERT into "permission denied
--      for function". Lint 0029 therefore stays open BY DESIGN. It is safe:
--      each helper takes no user identifier and derives everything from
--      auth.uid(), so calling it over RPC tells you only about yourself.
--      (The GRANTs below are re-stated explicitly so the REVOKE FROM PUBLIC
--      can't take authenticated down with it, whichever way the grant exists.)
--
--   3) community_notify_on_mention() is a TRIGGER function — it is fired by
--      the trigger machinery (which checks EXECUTE at CREATE TRIGGER time,
--      not per-row), and Postgres refuses a direct call outright ("trigger
--      functions can only be called as triggers"). So the grant buys nobody
--      anything → revoke it from everyone, exactly like rls_auto_enable in 0045.
--
--   4) "Public Bucket Allows Listing" — `page-assets` had ONE SELECT policy and
--      it was world-wide (`TO public USING (bucket_id = 'page-assets')`, 0067).
--      Public buckets serve object URLs through /object/public/… which bypasses
--      RLS entirely, so that policy was never what made images load — all it
--      did was let anyone LIST the bucket and walk every coach's `<uid>/…`
--      folder. Narrow it to the owner's own folder. Verified against the app:
--      pageAssets.js only ever calls upload / getPublicUrl / remove, and there
--      is no .list() anywhere in the repo — the owner scope is kept (rather
--      than dropping SELECT outright) because `remove()` deletes with RETURNING,
--      and RETURNING applies the SELECT policy too.
--
-- NOTE: §4 touches the storage schema — run this in the Supabase SQL editor.
-- ════════════════════════════════════════════════════════════════

-- ── 1) Pin search_path on the two remaining functions ───────────────────────
-- billing_enforced() has no identifiers in its body at all, so the finding is
-- vacuous today — it is pinned anyway because this function is DESIGNED to be
-- rewritten (0075 ships it as `SELECT false`, to be flipped when Stripe lands),
-- and the pin makes that future body safe by default.
-- Tradeoff, on purpose: a SET clause makes an SQL function non-inlinable, so
-- the planner can no longer constant-fold `NOT billing_enforced()` to true and
-- erase the RESTRICTIVE tier policies at plan time. Cost is one boolean call
-- per INSERT on clients/goals/projects/site_pages/booking_pages — the OR arms
-- after it still short-circuit, so the count() helpers are not reached while
-- enforcement is off.
CREATE OR REPLACE FUNCTION public.billing_enforced()
  RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT false $$;

-- Body identical to 0083 — only `SET search_path = ''` is added. Everything it
-- calls (to_jsonb, jsonb_exists, ->) lives in pg_catalog, which is always
-- implicitly searched, so an empty search_path is fully safe here.
CREATE OR REPLACE FUNCTION public.guard_immutable_columns()
  RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  col      text;
  old_json jsonb;
  new_json jsonb;
BEGIN
  -- Refuse misattachment by name: OLD is NULL on INSERT / statement-level, which
  -- would otherwise reject writes for reasons nobody could read off the error.
  IF TG_LEVEL <> 'ROW' OR TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION
      'guard_immutable_columns must be a FOR EACH ROW / BEFORE UPDATE trigger (got % / % on %)',
      TG_LEVEL, TG_OP, TG_TABLE_NAME;
  END IF;

  old_json := to_jsonb(OLD);
  new_json := to_jsonb(NEW);

  FOREACH col IN ARRAY TG_ARGV LOOP
    -- A typo'd column name would compare NULL to NULL and quietly guard nothing.
    IF NOT jsonb_exists(new_json, col) THEN
      RAISE EXCEPTION
        'guard_immutable_columns: table % has no column % (check the CREATE TRIGGER argument list)',
        TG_TABLE_NAME, col;
    END IF;

    IF old_json -> col IS DISTINCT FROM new_json -> col THEN
      RAISE EXCEPTION
        '%.% is immutable and cannot be changed by an update', TG_TABLE_NAME, col
        USING ERRCODE = 'check_violation';   -- 23514 → PostgREST answers 400, not 500
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

-- ── 2) Take the DEFINER helpers away from anon, keep them for authenticated ──
REVOKE EXECUTE ON FUNCTION public.booking_page_count()                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.client_count()                        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.community_access()                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_tier()                        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.goal_count()                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_reserved_display_name(text)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.onboarding_completed()                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.project_count()                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.site_page_count(text)                 FROM PUBLIC, anon;

GRANT  EXECUTE ON FUNCTION public.booking_page_count()                  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.client_count()                        TO authenticated;
GRANT  EXECUTE ON FUNCTION public.community_access()                    TO authenticated;
GRANT  EXECUTE ON FUNCTION public.current_tier()                        TO authenticated;
GRANT  EXECUTE ON FUNCTION public.goal_count()                          TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_reserved_display_name(text)        TO authenticated;
GRANT  EXECUTE ON FUNCTION public.onboarding_completed()                TO authenticated;
GRANT  EXECUTE ON FUNCTION public.project_count()                       TO authenticated;
GRANT  EXECUTE ON FUNCTION public.site_page_count(text)                 TO authenticated;

-- billing_enforced() is intentionally untouched here: the `invoices` edge
-- function calls it with the service-role client (functions/invoices/index.ts).

-- ── 3) Trigger-only function: nobody needs a direct grant ───────────────────
REVOKE EXECUTE ON FUNCTION public.community_notify_on_mention() FROM PUBLIC, anon, authenticated;

-- ── 4) page-assets: owner-scoped SELECT instead of world-wide ───────────────
-- Public image URLs keep working (public bucket ⇒ /object/public/ skips RLS);
-- what stops working is anonymous enumeration of the bucket.
DROP POLICY IF EXISTS "page_assets_public_read" ON storage.objects;

DROP POLICY IF EXISTS "page_assets_owner_read" ON storage.objects;
CREATE POLICY "page_assets_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'page-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 5) Deliberately NOT fixed (unchanged decisions) ─────────────────────────
--   • Extension in Public / pg_net — accepted, won't-fix. Re-confirming the
--     0045 + security-review-2026-06 (SA-5) reasoning: the functions actually
--     in use live in schema `net`, and all three cron jobs call net.http_post
--     (invoice-poll, grow-poll, purge-deleted-accounts). ALTER EXTENSION … SET
--     SCHEMA either fails or silently relocates those functions and breaks the
--     cron. Cosmetic gain, live-production risk.
--   • Extension in Public / btree_gist — same call, one degree worse: it backs
--     the `bookings_no_overlap` EXCLUDE constraint (0052), the anti-double-
--     booking guard. Relocating an opclass out from under a live exclusion
--     constraint is not worth a lint row.
--   • Leaked Password Protection — a dashboard toggle, not SQL, and gated on
--     the Pro plan (security-review-2026-06, SA-6). Enable it under
--     Authentication → Providers → Email if/when the project upgrades.
--   • Lint 0029 (authenticated can execute the DEFINER helpers) — by design,
--     see §2 above. Nine rows will remain in the advisor permanently.

NOTIFY pgrst, 'reload schema';
