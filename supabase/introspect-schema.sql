-- ════════════════════════════════════════════════════════════════
--  introspect-schema.sql — regenerate schema.sql from the live DB
-- ════════════════════════════════════════════════════════════════
--  schema.sql drifts, because migrations change the database and nobody
--  re-derives the reference file. Run this in the Supabase SQL editor and
--  hand the result back; schema.sql gets rebuilt from it.
--
--  HOW:
--    1. Supabase → SQL Editor → paste this whole file → Run.
--    2. Export the result (Download CSV, or select-all + copy).
--    3. Hand it over, and say which migration was the last one applied —
--       that number becomes the watermark in the regenerated header.
--
--  It reads pg_catalog rather than reconstructing DDL by hand, so
--  constraints, indexes and triggers come back as Postgres' own text via
--  pg_get_constraintdef / pg_get_indexdef / pg_get_triggerdef. What you get
--  is what is actually there — including anything applied outside a
--  migration file, which is exactly the drift worth catching.
--
--  Read-only. Touches no data.
-- ════════════════════════════════════════════════════════════════

WITH t AS (
  SELECT c.oid, c.relname, c.relrowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
), parts AS (

  /* 1 — columns: name, type, nullability, default */
  SELECT t.relname AS tbl, 1 AS grp, a.attnum::int AS ord,
         format('  %I %s%s%s',
           a.attname,
           format_type(a.atttypid, a.atttypmod),
           CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END,
           COALESCE(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '')) AS line
  FROM t
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid = t.oid AND d.adnum = a.attnum

  /* 2 — every constraint (PK / FK / UNIQUE / CHECK), as Postgres renders it */
  UNION ALL
  SELECT t.relname, 2, con.oid::int,
         format('  CONSTRAINT %I %s', con.conname, pg_get_constraintdef(con.oid))
  FROM t JOIN pg_constraint con ON con.conrelid = t.oid

  /* 3 — indexes that aren't already implied by a constraint */
  UNION ALL
  SELECT t.relname, 3, i.indexrelid::int, '  ' || pg_get_indexdef(i.indexrelid)
  FROM t JOIN pg_index i ON i.indrelid = t.oid
  WHERE NOT i.indisprimary
    AND NOT EXISTS (SELECT 1 FROM pg_constraint c2 WHERE c2.conindid = i.indexrelid)

  /* 4 — is RLS on? (off on a user table is usually a finding in itself) */
  UNION ALL
  SELECT t.relname, 4, 0,
         format('  -- RLS %s', CASE WHEN t.relrowsecurity THEN 'ENABLED' ELSE 'DISABLED  <-- check this' END)
  FROM t

  /* 5 — the policies themselves */
  UNION ALL
  SELECT p.tablename, 5, row_number() OVER (PARTITION BY p.tablename ORDER BY p.policyname)::int,
         format('  POLICY %I FOR %s TO %s USING (%s)%s',
           p.policyname, p.cmd, array_to_string(p.roles, ','),
           COALESCE(p.qual, 'true'),
           COALESCE(' WITH CHECK (' || p.with_check || ')', ''))
  FROM pg_policies p
  WHERE p.schemaname = 'public'

  /* 6 — triggers, excluding FK-enforcement internals */
  UNION ALL
  SELECT t.relname, 6, tg.oid::int, '  ' || pg_get_triggerdef(tg.oid)
  FROM t JOIN pg_trigger tg ON tg.tgrelid = t.oid
  WHERE NOT tg.tgisinternal

  /* 7 — table comments */
  UNION ALL
  SELECT t.relname, 7, 0, format('  -- COMMENT: %s', obj_description(t.oid, 'pg_class'))
  FROM t WHERE obj_description(t.oid, 'pg_class') IS NOT NULL
)

SELECT format('%s | %s', tbl, line) AS schema_line
FROM parts
ORDER BY tbl, grp, ord;

-- ════════════════════════════════════════════════════════════════
--  Worth running alongside it, and pasting too — three answers that
--  schema.sql cannot give you and that have already bitten:
--
--    -- which migrations' tables actually exist
--    SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1;
--
--    -- scheduled jobs and their cadence (a 15-minute invoice-poll once ran
--    -- up real charges)
--    SELECT jobname, schedule FROM cron.job ORDER BY 1;
--
--    -- any user table with RLS off
--    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--    WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity ORDER BY 1;
-- ════════════════════════════════════════════════════════════════
