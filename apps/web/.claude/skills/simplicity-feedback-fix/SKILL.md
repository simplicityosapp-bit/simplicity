---
name: simplicity-feedback-fix
description: Reads the Supabase feedback backlog (public.feedback), cross-references the repo files and MD docs to understand intended behavior, and autonomously fixes bugs that are clearly "alignment fixes" — bringing existing features back to their intended behavior. Stops and asks the user for any decision that requires design judgment, new behavior, or schema changes beyond the existing definitions. No Notion.
---

# Simplicity Feedback Fixer — Workflow Skill

## תפקיד

עובר על רשימת הפידבקים ב-Supabase (`public.feedback`), מצליב עם הריפו וקבצי ההקשר, ומתקן אוטומטית כל דבר שהוא "יישור קו" — פיצ'ר קיים שלא עובד כפי שמוגדר. עיצוב, החלטות מוצר, דברים לא מוגדרים — עוצר ושואל. **אין Notion** — מקור האמת הוא הטבלה, והלוח האנושי הוא מסך האדמין → פידבקים.

---

## הגדרת "יישור קו"

**מותר לתקן לבד:**
- לוגיקה שכתובה בקוד / schema אבל לא עובדת בפועל
- תצוגה (פונט, צבע, spacing, layout) שסוטה מ-tokens.css / screens.css
- חישוב שסוטה מ-C:\dev\simplicity-assets\analytics-formulas.md
- פיצ'ר שמוגדר ב-schema אבל לא מתפקד
- UI שמוגדר בקוד אבל נשבר (overflow, RTL, responsive)

**חייב לעצור ולשאול:**
- שינוי שלא מופיע בשום קובץ
- עיצוב שאינו נגזר ישירות מ-tokens.css
- פיצ'ר חדש שלא מוגדר בקוד
- שינוי סכמתי שלא קיים במיגרציות
- כל דבר שדורש שיקול דעת מוצרי

---

## עקרונות ליבה

1. **סיווג המשתמש הוא רמז, לא אמת.** משתמש שדיווח "באג" יכול לטעות — התיקון מתבסס על הקבצים, לא על הכותרת שהמשתמש בחר.
2. **הריפו + קבצי MD הם האמת.** לא מה שנראה הגיוני — מה שכתוב.
3. **יישור קו בלבד.** כוונה לא ברורה מהקבצים = עצור.
4. **תצוגה היא גם תיקון.** גרף שנמרח, פונט שגוי, כפתור שלא מגיב — תיקונים לגיטימיים.
5. **שמירה על דאטה.** שינוי סכמתי = migration קודם, כולל ערכי ברירת מחדל לשורות קיימות.
6. **תיקון אחד כל פעם.**
7. **תקשורת בעברית, פרומפטים ל-Claude Code באנגלית.**

---

## מבנה הריפו — מונוריפו (קרא לפני הכל)

`C:\dev\simplicity` הוא **מונוריפו pnpm**: `apps/web/` (אפליקציית הווב, package `mangata-react` — **מה שהסקיל הזה מתקן**), `apps/mobile/` (Expo RN, `simplicity-expo`), `packages/core/` (`@simplicity/core`), ו-`supabase/` בשורש (schema + migrations, משותף). קוד הווב כולו תחת `apps/web/src/`. build/lint דרך `pnpm web:build` / `pnpm web:lint` מהשורש (אין `npm run build`/`lint` בשורש).

---

## שלב 1 — טעינת הקשר

קרא לפני כל ריצה:

### קבצי מפרט והחלטות (קרא תוכן מלא)
- `C:\dev\simplicity-assets\analytics-formulas.md`
- `C:\dev\simplicity-assets\analytics.spec.md`
- `C:\dev\simplicity-assets\desingh.checklist.md`

### עיצוב (קרא תוכן מלא)
- `apps/web/src/styles/tokens.css`
- `apps/web/src/styles/screens.css`
- `apps/web/src/index.css`

### ארכיטקטורה (רשימה בלבד — פתח לפי צורך)
- `apps/web/src/App.jsx`
- `apps/web/src/lib/routes.js`
- `apps/web/src/hooks/` — שמות קבצים בלבד

### סכמה (קרא תוכן מלא)
- `supabase/schema.sql` (בשורש המונוריפו)
- `supabase/migrations/`

---

## שלב 2 — קריאת פידבק מ-Supabase + סדר עדיפויות

מקור האמת: `public.feedback` (Supabase EU `rdurkakzyymxhocvhufw`). קריאה/עדכון דרך ה-**CLI המקושר** בהרצת SQL (service-role / סיסמת DB — אותו ערוץ כמו מיגרציות); כשאין הרצה אוטומטית ב-env — **הפק את ה-SQL להרצה ידנית ע"י הבעלים**. **אין Notion.** הלוח האנושי: מסך אדמין → פידבקים.

שלוף פריטים פתוחים (באגים קודם, ואז לפי תאריך):
```sql
SELECT id, created_at, message, title, classification, surface, platform, status, notes, type
FROM public.feedback
WHERE status IN ('new', 'in_progress', 'waiting_decision')
ORDER BY (classification = 'bug') DESC, created_at ASC;
```

מיפוי סטטוסים: `new`=פתוח · `in_progress`=בעבודה/בוצע-וממתין · `waiting_decision`=ממתין להחלטה · `done`=טופל · `rejected`=נדחה. הסיווג הקובע הוא `classification` (bug/dev/unclear) — **לא** `type` (הדיווח העצמי של המשתמש, רמז בלבד).

### סדר בין סטטוסים — שלבים
**שלב א' (באגים קודם):** כל עוד יש ולו באג אחד פתוח (`classification='bug'`) — מטפלים רק בבאגים.
**שלב ב' (שאר):** רק אחרי שכל הבאגים טופלו — ממשיכים לפריטים `classification='dev'` / `'unclear'` שעדיין פתוחים.
פריטי שלב ב' אינם "יישור קו" — לכן **תמיד** מחזירים את כל החלטות המוצר/העיצוב/הסכמה למשתמש (באצ' אחד) לפני יישום, ולעולם לא מיישמים פיצ'ר חדש אוטומטית. אחרי אישור — מיישמים אחד בכל פעם, עם אותו זרימת build+lint+commit+עדכון השורה.

### סדר טיפול בתוך כל שלב
1. **קריטי קודם** — באגים שחוזרים על עצמם ממספר משתמשים, קריסות, בעיות טעינה
2. **לפי תאריך** — ישן יותר = קודם

לכל שורה קרא: `title`, `message`, `classification`, `surface`, `platform`, `notes`.

---

## שלב 3 — הערכת כל פידבק

### שאלות לבדיקה
1. האם הפיצ'ר מוגדר בקוד / schema / MD?
2. האם ברור מה הוא *אמור* לעשות?
3. האם התיקון הוא החזרה למוגדר, או שינוי ההגדרה?
4. האם נוגע בסכמה? → migration קודם
5. האם יש תופעות לוואי אפשריות?

### החלטה
| מצב | פעולה |
|---|---|
| יישור קו ברור + טכני | **תקן אוטומטית** |
| יישור קו ברור + תצוגה (נגזר מ-tokens) | **תקן אוטומטית** |
| כוונה לא ברורה מהקבצים | **עצור — שאל** |
| דורש החלטה עיצובית חדשה | **עצור — שאל** |
| דורש שינוי סכמתי חדש | **עצור — שאל** |
| פיתוח/רעיון/בקשה — ועדיין יש באגים פתוחים | **דלג כרגע** (שלב א') |
| פיתוח/רעיון/בקשה — וכל הבאגים טופלו | **שלב ב': באצ' שאלות מוצר → אישור → יישום** |

---

## שלב 4 — תיקון

### פרומפט ל-Claude Code

```
## Context
Simplicity app — Practice OS for Israeli coaches.
Monorepo root: C:\dev\simplicity\ (pnpm workspace). Web app lives in apps/web/ (package "mangata-react"). supabase/ (schema + migrations) is at the monorepo root. This fix targets apps/web.

## Source of truth files (read ALL of these first)
- apps/web/src/styles/tokens.css (design tokens — source of truth)
- apps/web/src/styles/screens.css (screen primitives)
- apps/web/src/index.css (globals)
- supabase/schema.sql (DB schema, at monorepo root)
- supabase/migrations/ (all migrations, at monorepo root)
- C:\dev\simplicity-assets\analytics-formulas.md (business logic)
- C:\dev\simplicity-assets\analytics.spec.md (analytics spec)
- C:\dev\simplicity-assets\desingh.checklist.md (design decisions)

## Bug report
[תיאור הבאג + מה המשתמש ציפה]

## Intended behavior (from source files)
[מה הקבצים אומרים שאמור לקרות]

## Platform: [mobile / desktop / both]

## Suspected location
[קובץ / hook / טבלה לפי כיוון הבדיקה מ-notes של השורה]

## Definition of "alignment fix"
This fix must bring the feature back to its defined/intended behavior.
Do NOT change behavior beyond what is already defined in the source files.
Do NOT make design decisions not grounded in tokens.css.

## Design rules
- No external UI library — hand-rolled CSS custom properties only
- All visual values from tokens.css only — never hardcode
- Hebrew RTL throughout
- Lucide icons only
- Each component has its own CSS file next to its JSX
- Light + dark mode parity via CSS custom properties

## Data safety
If schema change needed: write migration file first in supabase/migrations/
Migration must include default values for existing rows — not just ADD COLUMN.
Never DROP columns without explicit approval.

## Task
1. Read all source files listed above
2. Find root cause
3. Fix ONLY this — nothing beyond the defined behavior
4. If fix requires a decision not answerable from source files → STOP and report back
5. List exactly what changed and why
```

---

## שלב 5 — ולידציה עצמית

### א. Build
```bash
cd "C:\dev\simplicity"
pnpm web:build
```
נכשל → **עצור. תקן שגיאות build, ואז חזור לולידציה.**

### ב. Lint
`pnpm web:lint` הוא `eslint .` על **כל** אפליקציית הווב ו**נכשל מראש** (חוב lint קיים בקבצים שלא נגעת בהם). לכן הרץ lint רק על **הקבצים ששינית**, מתוך `apps/web`:
```bash
cd "C:\dev\simplicity/apps/web"
npx eslint <changed-file-relative-to-apps/web> ...
```
שגיאות lint *שהשינוי שלך הוסיף* → תקן לפני commit.
Warnings / חוב קיים שלא קשור → רשום ב-`notes` של השורה, אל תחסום.

### ג. בדיקת תקינות התיקון
לפני commit — שאל: "האם הבאג שתואר אכן נפתר לפי הקוד שנכתב?"
אם לא ברור — **עצור ודווח למשתמש.**

### ד. בדיקת migration
אם היה שינוי סכמתי:
- קובץ migration קיים ב-`migrations/`?
- כולל ערכי ברירת מחדל לשורות קיימות?
- לא כולל DROP ללא אישור?

חסר / חלקי → **עצור. כתוב migration מלא.**

### ה. Git commit
רק אחרי build + lint ללא שגיאות. ה-git repo בשורש המונוריפו `C:\dev\simplicity`. הוסף רק את הקבצים של התיקון הזה (כולל `pnpm-lock.yaml` של השורש אם השתנו dependencies) — לא `git add .` עיוור:
```bash
cd "C:\dev\simplicity"
git add <only-the-changed-files>
git commit -m "fix: [תיאור קצר] (feedback <short-id>)"
```

---

## שלב 6 — עדכון השורה ב-Supabase

### תיקון מוצלח
```sql
UPDATE public.feedback SET status = 'done',
  notes = '<מה תוקן, באיזה קובץ, תאריך + merge hash>'
WHERE id = '<uuid>';
```

### עצירה (שאלה פתוחה / החלטת מוצר)
```sql
UPDATE public.feedback SET status = 'waiting_decision',
  notes = '<מה חסר, מה השאלה הפתוחה>'
WHERE id = '<uuid>';
```

### דחייה
`status = 'rejected'` + סיבה ב-`notes`.

### אין הרצה אוטומטית של SQL
הפק את ה-UPDATE להרצה ידנית ע"י הבעלים, או עדכן דרך מסך האדמין → פידבקים. אל תסיים בלי שהשורה עודכנה (או שדיווחת שלא ניתן).

---

## שלב 7 — סיכום ריצה

```
סיכום ריצה — [תאריך ושעה]

✅ תוקן אוטומטית: X
  - [כותרת] — [קובץ שהשתנה]

⏸️ ממתין להחלטתך: X
  - [כותרת] — [מה השאלה הפתוחה]

⏭️ דולג (פיתוח, לא באג): X

מקור: public.feedback · צפייה/סימון: מסך אדמין → פידבקים
```

---

## כללי ברזל

- **לעולם** אל תשנה התנהגות מעבר למה שמוגדר בקבצים.
- **לעולם** אל תעשה החלטת עיצוב שלא נגזרת מ-tokens.css.
- **לעולם** אל תשנה סכמה בלי migration שמשמר דאטה + ערכי ברירת מחדל.
- **תמיד** עדכן את השורה ב-`public.feedback` — גם אם התיקון נכשל.
- **תמיד** תיקון אחד בכל פעם.
- **שלב א' לפני שלב ב':** לא נוגעים בפיתוח/רעיון/בקשה כל עוד נשאר באג פתוח אחד. רק כשאין באגים פתוחים — עוברים לשאר הסטטוסים, ותמיד דרך אישור מוצר (באצ').
- אם Claude Code מציע שינוי מעבר לתיקון — **עצור**.
- build + lint חייבים לעבור לפני כל commit.
