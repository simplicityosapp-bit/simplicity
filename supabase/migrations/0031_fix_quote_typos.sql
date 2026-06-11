-- ════════════════════════════════════════════════════════════════
-- Migration 0031 — fix clear typos in the system quote pool
-- ════════════════════════════════════════════════════════════════
-- Beta feedback 11/06/2026 (Notion: "ציטוטים עם תחביר עברי שגוי"): a few
-- of the 274 seeded quotes (migration 0015) had unambiguous spelling/typo
-- errors. This fixes ONLY clear typos — a duplicated word, missing letters,
-- and one obviously-truncated sentence. It deliberately does NOT:
--   • rephrase awkward-but-readable quotes,
--   • touch quotes that need an authorial wording decision
--     (e.g. "לפחות מהאמת גדול יותר…", "…האמת אמנם לא תמיד מפשירה…"),
--   • change the fixed-masculine phrasing to the user's form-of-address
--     (gender adaptation is a separate, larger decision).
--
-- Data-safe: each UPDATE matches by the exact current text, and quotes.text
-- is UNIQUE, so each statement touches at most one row. The corrected texts
-- don't collide with existing rows. Idempotent — once applied, the WHERE
-- clauses match the (now-corrected) rows 0 times, so re-running is a no-op.
-- ════════════════════════════════════════════════════════════════

-- duplicated word: "הגדולים הגדולים" → "הגדולים"
UPDATE quotes SET text = 'האנשים הגדולים ביותר הם אלה שמביאים את הטוב ביותר גם מאחרים.'
 WHERE text = 'האנשים הגדולים הגדולים ביותר הם אלה שמביאים את הטוב ביותר גם מאחרים.';

-- doubled letter: "לליצור" → "ליצור"
UPDATE quotes SET text = 'הדרך ליצור פתרונות היא להפסיק לפחד מהבעיות.'
 WHERE text = 'הדרך לליצור פתרונות היא להפסיק לפחד מהבעיות.';

-- missing letter: "כשנחנו" → "כשאנחנו"
UPDATE quotes SET text = 'כשאנחנו מאטים, אנחנו רואים יותר.'
 WHERE text = 'כשנחנו מאטים, אנחנו רואים יותר.';

-- wrong word: "גדים" → "גדלים"
UPDATE quotes SET text = 'אנחנו גדלים על-ידי האנשים שלנו ועל-ידי ההרגלים שלנו. לריתמוס יש כוח אדיר.'
 WHERE text = 'אנחנו גדים על-ידי האנשים שלנו ועל-ידי ההרגלים שלנו. לריתמוס יש כוח אדיר.';

-- truncated sentence — missing the copula "היא"
UPDATE quotes SET text = 'הדרך הכי בטוחה היא לחיות בצד השני של הפחד.'
 WHERE text = 'הדרך הכי בטוחה לחיות בצד השני של הפחד.';

NOTIFY pgrst, 'reload schema';
