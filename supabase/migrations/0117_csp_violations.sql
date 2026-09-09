-- ════════════════════════════════════════════════════════════════
-- Migration 0117 — somewhere for CSP violations to actually land
-- ════════════════════════════════════════════════════════════════
-- The Content-Security-Policy in vercel.json is Report-Only, which is only
-- useful if somebody can read what it reports. api/csp-report.js has been
-- the destination since it was written, and it logs one line per violation
-- to Vercel's function logs — which on the Hobby plan are not retained for
-- querying. Checked on 2026-09-09: a two-hour window returned zero log lines
-- even for API calls made inside it. So every report the policy has ever
-- produced was written down and thrown away.
--
-- That mattered more than it looks. Until 2026-09-09 the two pinned inline
-- script hashes were computed from a CRLF working copy while Vercel serves
-- LF, so EVERY page load violated the policy and nobody could see it.
--
-- This table is that missing destination. It exists to answer one question —
-- "is it safe to enforce this policy?" — and should be dropped once it has.
--
-- Read it aggregated, not row by row:
--   SELECT directive, blocked_uri, count(*), max(created_at)
--   FROM csp_violations GROUP BY 1,2 ORDER BY 3 DESC;
--
-- Written ONLY by the public `csp-report` edge function (service role), which
-- caps, filters and rate-limits first. RLS is ON with NO policy — exactly the
-- landing_events arrangement (migration 0050) — so anon and authenticated
-- clients can neither read nor write it. Nothing here is personal: a
-- violation names a directive and a blocked URL, never a person.
--
-- DATA SAFETY: additive — a new table + indexes, no existing data touched.
-- Idempotent via IF NOT EXISTS.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS csp_violations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  directive     text,
  blocked_uri   text,
  document_uri  text,
  source_file   text,
  line_number   integer,
  script_sample text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_csp_violations_created ON csp_violations (created_at);
CREATE INDEX IF NOT EXISTS idx_csp_violations_directive ON csp_violations (directive, created_at);

ALTER TABLE csp_violations ENABLE ROW LEVEL SECURITY;
-- No policy on purpose: only the service role (the edge function) bypasses
-- RLS. A public endpoint that could be read back is a public endpoint worth
-- attacking; this one can only be written, and only through the function.

NOTIFY pgrst, 'reload schema';
