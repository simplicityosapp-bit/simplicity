---
name: simplicity-fix
description: Find and fix bugs, performance issues, and UI/UX problems in the Simplicity app (סימפליסיטי). Supports both targeted fixes (user-reported issue) and general scan sessions. Respects design decisions from source files — never makes design changes without user approval unless clearly grounded in the existing design tokens and patterns. Client feedback is fixed only if purely technical; design changes require explicit user approval.
---

# Simplicity Fix & Debug — Workflow Skill

## תפקיד

סשן לאיתור ותיקון בעיות באפליקציית סימפליסיטי. הסקיל פועל בשני מצבים: ממוקד (בעיה ידועה) או כללי (סריקה עצמאית). בכל מקרה — לא פועל ללא מידע מספיק, לא עושה שינויי עיצוב בלי אישור.

---

## עקרונות ליבה

1. **שאל קודם, תקן אחר כך.** אין תיקון לפני הבנה מלאה של הבעיה.
2. **עיצוב = אישור מפורש.** שינוי ויזואלי שאינו נשען ישירות על `tokens.css` / `screens.css` — חייב אישור מהמשתמש לפני מימוש.
3. **פידבק לקוח טכני בלבד.** אם הבעיה הגיעה מלקוח — תקן רק אם זו בעיה טכנית ברורה (באג, קריסה, שגיאה). שינוי עיצובי מפידבק לקוח = הצג למשתמש, חכה לאישור.
4. **חסר מידע = עצור.** אם אין תשובה ברורה בקבצי הפרויקט לשאלת UI/UX — שאל את המשתמש. אסור לנחש.
5. **תת-תיקון אחד כל פעם.** לא עוברים לבעיה הבאה לפני שהנוכחית טופלה ואושרה.
6. **שמירה על דאטה.** אם תיקון נוגע בסכמה — migration שמשמר דאטה קיים, בדיוק כמו בסקיל הפיתוח.
7. **תקשורת בעברית, פרומפטים ל-Claude Code באנגלית.**

---

## שלב 0 — פתיחת סשן (שאלה אחת)

שאל את המשתמש:

> "יש בעיה ספציפית שאתה רוצה לטפל בה, או שזה סשן סריקה כללי?"

**אם יש בעיה ספציפית** — עבור לשלב 1א.
**אם סשן כללי** — עבור לשלב 1ב.

שאל גם: "הבעיה הגיעה ממך או מפידבק לקוח?"

---

## שלב 1א — בעיה ידועה

1. בקש תיאור מלא: מה קורה, באיזה מסך, איזה פעולה מפעילה את זה, מה הפלט הצפוי לעומת הפועל.
2. אם הגיע מלקוח — ציין: "אם זו בעיה עיצובית ולא טכנית, אציג אותה לאישורך לפני תיקון."
3. עבור לשלב 2 (Context Load).

---

## שלב 1ב — סשן כללי

הגדר מה לסרוק. ברירת מחדל:

| קטגוריה | מה לחפש |
|---|---|
| **באגים** | console errors, unhandled promises, missing null checks, broken routes |
| **ביצועים** | re-renders מיותרים, קריאות Supabase כפולות, images לא מאופטמות, hooks שמריצים effect בלי dependency array נכון |
| **UI/UX** | אלמנטים חתוכים, overflow בלתי מטופל, RTL שבור, states חסרים (loading/empty/error), inconsistency עם tokens — לכל בעיה: ציין פלטפורמה (מובייל / דסקטופ / שתיהן) |
| **סכמה** | עמודות שלא בשימוש, queries ללא RLS, missing indexes על שדות שמחפשים לפיהם |

שאל: "יש קטגוריה שאתה רוצה להתמקד בה, או שסורקים הכל?"

---

## מבנה הריפו — מונוריפו (קרא לפני הכל)

`C:\dev\simplicity` הוא **מונוריפו pnpm**: `apps/web/` (אפליקציית הווב, package `mangata-react`, Vite/React — **מה שהסקיל הזה מתקן**), `apps/mobile/` (Expo RN, `simplicity-expo`), `packages/core/` (`@simplicity/core`), ו-`supabase/` בשורש (schema + migrations, משותף). קוד הווב כולו תחת `apps/web/src/`. פקודות מהשורש: `pnpm web:build` / `pnpm web:lint` / `pnpm web:test` (אין `npm run build`/`lint` בשורש).

---

## שלב 2 — Context Load (אוטומטי)

קרא לפני כל סשן. אם קובץ לא קיים — ציין ואל תמשיך.

### עיצוב
- `apps/web/src/styles/tokens.css` — כל design tokens
- `apps/web/src/styles/screens.css` — shared primitives
- `apps/web/src/index.css` — globals + per-screen theming

### ארכיטקטורה
- `apps/web/src/App.jsx` — routing + guards
- `apps/web/src/lib/routes.js`
- `apps/web/src/lib/supabase.js`

### סכמה
- `supabase/schema.sql` (בשורש המונוריפו)
- `supabase/migrations/` — כל הקבצים

### לבעיה ספציפית — קרא גם:
- את המסך / component הרלוונטי (`apps/web/src/screens/`, `apps/web/src/components/`)
- את ה-hook הרלוונטי מ-`apps/web/src/hooks/`

---

## אימות בפריוויו ללא התחברות (mock mode)

האפליקציה חוסמת כל מסך מאחורי התחברות Supabase, ו-Claude **לא יכול** להתחבר (אסור להזין סיסמה / OAuth / signIn תוכנתי). כדי לאמת ויזואלית את האפליקציה המחוברת בפריוויו המקומי — השתמש במצב ה-mock המובנה (אין צורך שהמשתמש יסביר כל פעם):

1. הפעל את שרת הפיתוח: `preview_start` עם config `vite` (פורט 5174) — הקונפיג ב-`apps/web/.claude/launch.json`, מריץ את אפליקציית הווב.
2. טען את האפליקציה עם **`?mock=1`** ב-URL — או הרץ `localStorage.setItem('PREVIEW_MOCK','1')` ואז reload.
3. `apps/web/src/lib/supabase.js` מחליף את ה-client ל-mock (`apps/web/src/lib/mockSupabase.js`) עם נתוני `apps/web/src/data/mock.js`: session מזויף + prefs מלאים (אונבורדינג מסומן כהושלם), כך שהאפליקציה נוחתת על הבית. בלי auth, בלי רשת, בלי סיסמה.
4. אז אפשר `preview_snapshot` / `preview_screenshot` / `preview_eval` לאימות רגיל.

**בטיחות (חשוב):** פעיל **רק ב-DEV ורק עם ה-flag**. ב-build של פרודקשן `import.meta.env.DEV===false` → הקוד נמחק לגמרי (tree-shaken; אומת שאין זכר ב-`dist`). אפס השפעה על משתמשים אמיתיים או על כניסות אמיתיות; ה-flag יושב ב-localStorage של דפדפן הפריוויו של Claude Code בלבד.

הערה: hooks שמייצרים רשומות (פגישות / הוראות קבע) עלולים להוסיף אזהרת `duplicate key` בקונסול תחת StrictMode — רעש dev בלבד, אפשר להתעלם.

---

## שלב 3 — Investigation

### לבעיה ידועה:

נסח פרומפט ל-Claude Code באנגלית:

```
## Context
Simplicity app — Practice OS for Israeli coaches.
Monorepo root: C:\dev\simplicity\ (pnpm workspace). Web app lives in apps/web/ (package "mangata-react"). supabase/ (schema + migrations) is at the monorepo root. This task targets apps/web.

## Issue to investigate
[תיאור הבעיה]

## Source: [user / client feedback]

## Suspected location
[מסך / component / hook]

## Read these files first
[רשימת קבצים רלוונטיים]

## Task
1. Find the root cause
2. Do NOT fix yet — report findings first
3. If the fix involves a design change, flag it clearly
4. If the fix involves a schema change, flag it and note what migration would be needed
```

### לסשן כללי:

```
## Context
Simplicity app — Practice OS for Israeli coaches.
Monorepo root: C:\dev\simplicity\ (pnpm workspace). Web app lives in apps/web/ (package "mangata-react"). supabase/ (schema + migrations) is at the monorepo root. This scan targets apps/web.

## Scan scope
[קטגוריות שנבחרו]

## Read these files first
- apps/web/src/styles/tokens.css
- apps/web/src/styles/screens.css
- supabase/schema.sql
- All files in apps/web/src/screens/
- All files in apps/web/src/hooks/
- All files in apps/web/src/modals/

## Task
Scan for issues in the categories above.
For each issue found:
1. File + line number
2. Issue type (bug / performance / UI/UX / schema)
3. Severity (critical / medium / low)
4. Platform (mobile / desktop / both) — for UI/UX issues
5. Root cause (1 sentence)
6. Flag: is the fix purely technical, or does it involve a design decision?

Do NOT fix anything yet — report only.
```

---

## שלב 4 — Triage (לפני כל תיקון)

לאחר קבלת הממצאים — הצג למשתמש רשימה:

```
נמצאו X בעיות:

🔴 קריטי:
  - [תיאור קצר] — [סוג: טכני / עיצובי] — [פלטפורמה: מובייל / דסקטופ / שתיהן]

🟡 בינוני:
  - ...

⚪ נמוך:
  - ...

בעיות שדורשות אישורך לפני תיקון (עיצובי / פידבק לקוח):
  - ...
```

שאל: "מה לתקן קודם?"

---

## שלב 5 — Fix Loop

לכל בעיה שאושרה לתיקון:

### א. בדיקה לפני תיקון

- האם זה שינוי עיצובי? → חובה אישור
- האם זה שינוי סכמתי? → חובה migration שמשמר דאטה
- האם זה מפידבק לקוח? → תקן רק אם טכני בלבד
- האם יש תופעות לוואי אפשריות במסכים אחרים?
- אם זו בעיית UI/UX — על איזו פלטפורמה היא מופיעה? התיקון חייב להיבדק בשתי הפלטפורמות לפני סגירה.

### ב. פרומפט תיקון ל-Claude Code

```
## Context
Simplicity app — Practice OS for Israeli coaches.
Monorepo root: C:\dev\simplicity\ (pnpm workspace). Web app lives in apps/web/ (package "mangata-react"). supabase/ (schema + migrations) is at the monorepo root. This fix targets apps/web.

## Issue
[תיאור הבעיה + root cause]

## Approved fix
[מה אושר לתיקון]

## Design rules
- No external UI library — hand-rolled CSS custom properties only
- All colors/spacing/radius from tokens.css only — never hardcode values
- Hebrew RTL throughout
- Lucide icons only
- Each component has its own CSS file next to its JSX

## Data safety
If schema change needed: write migration first, preserve all existing user data.

## Fix this, nothing else.
## After fixing, list exactly what changed and why.
```

### ג. דיווח למשתמש

2-3 משפטים בעברית: מה תוקן, מה השתנה, האם יש משהו לבדוק ידנית.

### ד. טבלת תפיסת בעיות

| מצב | פעולה |
|---|---|
| תיקון טכני ברור | תקן + דווח |
| שינוי עיצובי | הצג למשתמש + חכה לאישור |
| פידבק לקוח + עיצובי | הצג למשתמש + חכה לאישור |
| שינוי סכמתי | כתוב migration קודם |
| תופעת לוואי אפשרית | ציין + שאל לפני המשך |
| Claude Code נכשל | נסה פעם אחת. אם לא — עצור + שאל |

---

## שלב 6 — סיכום סשן

בסוף כל סשן:

- כמה בעיות נמצאו / תוקנו / נדחו
- בעיות שנשארו פתוחות ולמה
- האם יש migration שצריך להריץ בסופבייס?
- המלצות לסשן הבא (אם רלוונטי)

---

## כללי ברזל

- **לעולם** אל תשנה עיצוב ללא אישור, גם אם "ברור" שזו בעיה.
- **לעולם** אל תתקן פידבק לקוח עיצובי ללא אישור מהמשתמש.
- **לעולם** אל תשנה סכמה בלי migration שמשמר דאטה.
- **לעולם** אל תנחש ערכי CSS — תמיד קרא `tokens.css`.
- **תמיד** דווח ממצאים לפני תיקון — אף פעם לא מתקן בשקט.
- אם המשתמש אומר "המשך / רוץ עם זה" — זה אישור גורף לתיקונים הטכניים בלבד.
