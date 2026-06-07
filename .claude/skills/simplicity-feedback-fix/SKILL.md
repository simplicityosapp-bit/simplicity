---
name: simplicity-feedback-fix
description: Reads the Notion feedback backlog, cross-references the repo files and MD docs to understand intended behavior, and autonomously fixes bugs that are clearly "alignment fixes" — bringing existing features back to their intended behavior. Stops and asks the user for any decision that requires design judgment, new behavior, or schema changes beyond the existing definitions.
---

# Simplicity Feedback Fixer — Workflow Skill

## תפקיד

עובר על רשימת הפידבקים ב-Notion, מצליב עם הריפו וקבצי ההקשר, ומתקן אוטומטית כל דבר שהוא "יישור קו" — פיצ'ר קיים שלא עובד כפי שמוגדר. עיצוב, החלטות מוצר, דברים לא מוגדרים — עוצר ושואל.

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

## שלב 1 — טעינת הקשר

קרא לפני כל ריצה:

### קבצי מפרט והחלטות (קרא תוכן מלא)
- `C:\dev\simplicity-assets\analytics-formulas.md`
- `C:\dev\simplicity-assets\analytics.spec.md`
- `C:\dev\simplicity-assets\desingh.checklist.md`

### עיצוב (קרא תוכן מלא)
- `src/styles/tokens.css`
- `src/styles/screens.css`
- `src/index.css`

### ארכיטקטורה (רשימה בלבד — פתח לפי צורך)
- `src/App.jsx`
- `src/lib/routes.js`
- `src/hooks/` — שמות קבצים בלבד

### סכמה (קרא תוכן מלא)
- `supabase/schema.sql`
- `supabase/migrations/`

---

## שלב 2 — קריאת Notion + סדר עדיפויות

קרא רשומות עם סטטוס **פתוח** מ:
**Data source:** `collection://c2e8479e-b8c3-4282-bc6d-c760c88a68cb`

### סדר בין סטטוסים — שלבים
**שלב א' (באגים קודם):** כל עוד יש ולו באג אחד פתוח — מטפלים רק בבאגים (`סיווג = באג`).
**שלב ב' (שאר הסטטוסים):** רק אחרי שכל הבאגים טופלו — ממשיכים לפריטים שסיווגם `פיתוח` / `רעיון` / `בקשה` שעדיין `פתוח`.
פריטי שלב ב' אינם "יישור קו" — לכן **תמיד** מחזירים את כל החלטות המוצר/העיצוב/הסכמה למשתמש (באצ' אחד) לפני יישום, ולעולם לא מיישמים פיצ'ר חדש אוטומטית. אחרי אישור — מיישמים אחד בכל פעם, עם אותו זרימת build+lint+commit+עדכון Notion.

### סדר טיפול בתוך כל שלב
1. **קריטי קודם** — באגים שחוזרים על עצמם ממספר משתמשים, קריסות, בעיות טעינה
2. **לפי תאריך** — ישן יותר = קודם

לכל רשומה קרא: כותרת, תיאור מלא, סיווג, טכני או עיצובי, פלטפורמה, הערות.

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
Repo root: C:\dev\simplicity\

## Source of truth files (read ALL of these first)
- src/styles/tokens.css (design tokens — source of truth)
- src/styles/screens.css (screen primitives)
- src/index.css (globals)
- supabase/schema.sql (DB schema)
- supabase/migrations/ (all migrations)
- C:\dev\simplicity-assets\analytics-formulas.md (business logic)
- C:\dev\simplicity-assets\analytics.spec.md (analytics spec)
- C:\dev\simplicity-assets\desingh.checklist.md (design decisions)

## Bug report
[תיאור הבאג + מה המשתמש ציפה]

## Intended behavior (from source files)
[מה הקבצים אומרים שאמור לקרות]

## Platform: [mobile / desktop / both]

## Suspected location
[קובץ / hook / טבלה לפי כיוון הבדיקה מ-Notion]

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
npm run build
```
נכשל → **עצור. תקן שגיאות build, ואז חזור לולידציה.**

### ב. Lint
```bash
cd "C:\dev\simplicity"
npm run lint
```
שגיאות lint → תקן לפני commit.
Warnings → רשום בהערות Notion, אל תחסום.

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
רק אחרי build + lint ללא שגיאות:
```bash
cd "C:\dev\simplicity"
git add .
git commit -m "fix: [תיאור קצר] (https://app.notion.com/p/b9312c65b4ca43e7907fea3725da470e)"
```

---

## שלב 6 — עדכון Notion

### תיקון מוצלח
- סטטוס → **טופל**
- הערות → מה תוקן, באיזה קובץ, תאריך + hash של commit

### עצירה
- סטטוס → **ממתין להחלטה**
- הערות → מה חסר, מה השאלה הפתוחה

### Notion לא זמין
המשך לתקן, רשום לעצמך, ועדכן Notion בסוף הריצה.

---

## שלב 7 — סיכום ריצה

```
סיכום ריצה — [תאריך ושעה]

✅ תוקן אוטומטית: X
  - [כותרת] — [קובץ שהשתנה]

⏸️ ממתין להחלטתך: X
  - [כותרת] — [מה השאלה הפתוחה]

⏭️ דולג (פיתוח, לא באג): X

📌 https://app.notion.com/p/b9312c65b4ca43e7907fea3725da470e
```

---

## כללי ברזל

- **לעולם** אל תשנה התנהגות מעבר למה שמוגדר בקבצים.
- **לעולם** אל תעשה החלטת עיצוב שלא נגזרת מ-tokens.css.
- **לעולם** אל תשנה סכמה בלי migration שמשמר דאטה + ערכי ברירת מחדל.
- **תמיד** עדכן Notion — גם אם התיקון נכשל.
- **תמיד** תיקון אחד בכל פעם.
- **שלב א' לפני שלב ב':** לא נוגעים בפיתוח/רעיון/בקשה כל עוד נשאר באג פתוח אחד. רק כשאין באגים פתוחים — עוברים לשאר הסטטוסים, ותמיד דרך אישור מוצר (באצ').
- אם Claude Code מציע שינוי מעבר לתיקון — **עצור**.
- build + lint חייבים לעבור לפני כל commit.
