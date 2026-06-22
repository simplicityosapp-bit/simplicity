-- ════════════════════════════════════════════════════════════════
-- Migration 0049 — quote QA round 2: remaining semantic fix + gender variants
-- ════════════════════════════════════════════════════════════════
-- A second editorial pass over the 274-quote system pool (seeded in 0015,
-- already corrected by 0031 + 0042). This migration:
--   1. Fixes three semantic/spelling errors in the base `text` that the earlier
--      rounds missed: "לסבל"→"לסבול" (dropped vav, infinitive); the garbled
--      "פגיעות היא ממנה מגיע ההתחברות." → a grammatical rephrase (owner-approved,
--      also fixing the מגיע→מגיעה agreement); and "שנא"→"שונא" (missing vav for
--      the present participle). Genuinely-awkward-but-correct lines that are only
--      stylistically obscure (e.g. the intentional "…האמת אמנם לא תמיד מפשירה,
--      אבל תמיד מכינה" wordplay) are deliberately left untouched.
--   2. Adds text_female for reader-addressing quotes that 0042 did NOT yet
--      cover (imperatives like אל תבנה/אל תחכה/התחל and 2nd-person אתה/תוכל
--      forms). The base `text` stays the masculine/neutral form the client
--      falls back to for male users; only text_female is added.
--      Neutral / 3rd-person / universal aphorisms are left as-is.
--
-- DATA SAFETY: UPDATEs only — no DROP/DELETE, no INSERT. Each statement is
-- keyed on the exact CURRENT text, and quotes.text is UNIQUE, so each touches
-- at most one row; a row whose text doesn't match is simply skipped (left
-- untouched). The gender-only UPDATEs are fully re-runnable (idempotent — they
-- just re-set the same text_female). The single text-correcting UPDATE runs
-- once: after it applies, the old text no longer matches, so re-runs are no-ops.
-- Every literal apostrophe inside a Hebrew string is doubled ('') per SQL.
-- ════════════════════════════════════════════════════════════════

-- ── 1. Semantic / spelling fixes (base text) ────────────────────
-- dropped vav in infinitive: "לסבל" → "לסבול"
UPDATE quotes SET text = 'הסוד של חיים מלאים הוא להיות מוכן לסבול את האמת.'
 WHERE text = 'הסוד של חיים מלאים הוא להיות מוכן לסבל את האמת.';

-- garbled syntax + gender disagreement (ההתחברות fem → מגיעה): rephrased
-- to a grammatical form approved by the owner.
UPDATE quotes SET text = 'פגיעות היא המקור שממנו מגיעה ההתחברות.'
 WHERE text = 'פגיעות היא ממנה מגיע ההתחברות.';

-- missing vav for the present participle: "שנא" (past) → "שונא" (present),
-- which the gnomic "כל אמן טוב…" requires.
UPDATE quotes SET text = 'כל אמן טוב שונא את עצמו מספיק כדי לצמוח.'
 WHERE text = 'כל אמן טוב שנא את עצמו מספיק כדי לצמוח.';

-- ── 2. New gender variants (text_female) ────────────────────────
-- not previously covered by 0042; base text stays masculine/neutral.

UPDATE quotes SET text_female = 'לא תוכלי לנהל אנשים אם לא תוכלי לנהל את עצמך.'
 WHERE text = 'לא תוכל לנהל אנשים אם לא תוכל לנהל את עצמך.';

UPDATE quotes SET text_female = 'אל תבלבלי פעילות עם הצלחה.'
 WHERE text = 'אל תבלבל פעילות עם הצלחה.';

UPDATE quotes SET text_female = 'ההצלחה בחיים אינה תלויה בכמות מה שיש לך, אלא בכמות שאת נותנת.'
 WHERE text = 'ההצלחה בחיים אינה תלויה בכמות מה שיש לך, אלא בכמות שאתה נותן.';

UPDATE quotes SET text_female = 'אם רצונך לשפר את העולם, התחילי בחדרך.'
 WHERE text = 'אם רצונך לשפר את העולם, התחל בחדרך.';

UPDATE quotes SET text_female = 'אל תבני עסק. בני קהילה.'
 WHERE text = 'אל תבנה עסק. בנה קהילה.';

UPDATE quotes SET text_female = 'אל תחכי ליום המושלם לפתוח עסק. הוא לא יבוא.'
 WHERE text = 'אל תחכה ליום המושלם לפתוח עסק. הוא לא יבוא.';

UPDATE quotes SET text_female = 'בשקיפות יש חוזק שאי-שקיפות לא תוכלי ליצור.'
 WHERE text = 'בשקיפות יש חוזק שאי-שקיפות לא תוכל ליצור.';

NOTIFY pgrst, 'reload schema';
