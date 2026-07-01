---
name: simplicity-feature
description: Build or design a new feature, screen, fix, or schema change for the Simplicity app (סימפליסיטי) — a Practice OS for Israeli coaches and mentors. Use when the user wants to develop, design, or implement anything for Simplicity. Loads project context by reading repo files directly, asks all clarifying questions before starting, breaks the task into sub-tasks, executes one thing at a time via Claude Code, and never makes autonomous decisions — every product, schema, or design decision returns to the user for approval. Never touches live Supabase data without explicit migration logic that preserves existing user data.
---

# Simplicity Feature Build — Workflow Skill

## תפקיד

מטרת הסקיל: לפתח / לעצב פיצ'ר, מסך, תיקון, או שינוי סכמה עבור אפליקציית סימפליסיטי בצורה מבוקרת. הסקיל אוסף הקשר מהריפו עצמו, לא מהנחות. Claude Code הוא המבצע, המשתמש הוא הסמכות הסופית.

---

## עקרונות ליבה — חובה לציית

1. **אפס החלטות אוטונומיות.** כל החלטה חדשה (שינוי סכמה, החלטת מוצר, שינוי עיצוב מהותי) חוזרת למשתמש לאישור לפני המשך.
2. **אין התחלה לפני שכל המידע נאסף.** שאל את כל השאלות הקריטיות. רק אחרי שאין אי-בהירות — להתחיל.
3. **חסר מידע = עצור.** אם הקבצים לא מספקים תשובה ברורה לשאלת עיצוב או סכמה — שאל את המשתמש. אסור לנחש.
4. **שמירה על דאטה קיים של משתמשים.** כל שינוי סכמתי חייב לכלול migration שמשמר ומעדכן נתונים קיימים. אסור לשבור או למחוק דאטה של משתמשים.
5. **תת-משימה אחת כל פעם.** לא מתחילים תת-משימה הבאה לפני שהנוכחית הושלמה ואושרה.
6. **חשיבה ביקורתית לפני מימוש.** לפני כל תת-משימה — שאל: מה יכול להשתבש? האם יש גישה טובה יותר? רק אז לכתוב קוד.
7. **תקשורת עם המשתמש בעברית, מילולית, בלי קוד.**
8. **פרומפטים ל-Claude Code באנגלית** (לאיכות פלט גבוהה יותר).

---

## שלב 1 — Context Load (אוטומטי, בתחילת כל הפעלה)

קרא את הקבצים הבאים. בלי לדלג. אם קובץ לא קיים — ציין זאת ואל תמשיך.

### עיצוב וטוקנים
- `src/styles/tokens.css` — כל CSS custom properties (צבעים, spacing, radius, blur)
- `src/styles/screens.css` — primitives משותפים (`.screen`, `.screen-top`, `.cta-add`, `.s-hero`, `.mg-toggle`)
- `src/index.css` — globals, per-screen theming, backgrounds


### ארכיטקטורה
- `src/App.jsx` — routing + onboarding guard
- `src/lib/routes.js` — כל ה-routes
- `src/lib/supabase.js` — Supabase client init

### סכמה ונתונים
- `supabase/schema.sql` — 28 טבלאות, source of truth לסכמה
- `supabase/migrations/` — כל המיגרציות הקיימות (קרא את כולן)

### Hooks קיימים
- `src/hooks/` — קרא את רשימת הקבצים. לפני כל פיצ'ר — בדוק אם hook רלוונטי כבר קיים.

### תיעוד
- `C:\dev\simplicity-assets\analytics-formulas.md`
- `C:\dev\simplicity-assets\analytics.spec.md`
- `C:\dev\simplicity-assets\desingh.checklist.md`
- `README.md`

**עיקרי הזיכרון לאחר הקריאה:**
- אין UI library חיצוני — הכל hand-rolled עם CSS custom properties
- Glass aesthetic: `backdrop-filter: blur()` על רקעי WebP per-screen
- עברית RTL throughout — `dir="rtl"` default
- Lucide בלבד לאייקונים
- כל component יש לו CSS קובץ משלו לידו

---

## שלב 2 — Task Definition

1. שאל את המשתמש מה המשימה במילים שלו.
2. לאחר הקריאה של הקבצים, אם עדיין חסר מידע בנושאים הבאים — שאל:
   - איזה מסך / component / טבלה זה נוגע?
   - מה התוצאה הרצויה (UX, לוגיקה, שינוי ויזואלי)?
   - האם יש שינוי בסכמה? אם כן — מה קורה לדאטה הקיים?
   - מהם קריטריוני הסיום?
3. הצג סיכום: "זאת המשימה כפי שהבנתי — נכון?"
4. **רק אחרי אישור — ממשיכים לשלב 3.**

---

## שלב 3 — Decomposition + Critical Review

1. פרק את המשימה ל-3-7 תת-משימות.
2. לפני הצגת הפירוק — **חשוב בקול:**
   - "מה יכול להשתבש בגישה הזו?"
   - "האם יש גישה אחרת שלא חשבתי עליה?"
   - "האם משהו בסכמה הקיימת מגביל אותי?"
3. הצג פירוק + תובנות מהחשיבה הביקורתית. קבל אישור מהמשתמש.

---

## שלב 4 — Execution Loop

לכל תת-משימה:

### א. חשיבה ביקורתית לפני כתיבת קוד

לפני כל תת-משימה, ענה לעצמך:
- "האם ה-hook הרלוונטי כבר קיים ב-`hooks/`?"
- "האם יש component דומה שאפשר לשכפל ולהתאים?"
- "האם השינוי הזה דורש migration? אם כן — מה קורה לדאטה הקיים?"
- "האם זה שובר RLS policies קיימות?"

### ב. הכנת הפרומפט ל-Claude Code

נסח באנגלית, כולל:

```
## Context
Working on Simplicity (סימפליסיטי) — a Practice OS for Israeli coaches and mentors.
Repo root: C:\dev\simplicity\

## Source of truth files (read these first)
- src/styles/tokens.css (all design tokens)
- src/styles/screens.css (shared screen primitives)
- src/index.css (globals + per-screen theming)
- supabase/schema.sql (DB schema — 28 tables)

- supabase/migrations/ (all existing migrations)

## Design rules (always derive from files, never from memory)
- No external UI library — hand-rolled CSS custom properties only
- Glass aesthetic: backdrop-filter blur over per-screen WebP backgrounds
- Hebrew RTL throughout (dir="rtl")
- Lucide icons only
- Each component has its own CSS file next to its JSX
- Light + dark mode parity via CSS custom properties

## Data safety rule (non-negotiable)
If this task involves schema changes:
- Write a migration file in supabase/migrations/
- The migration must preserve and transform existing user data
- Never DROP columns or tables that contain user data without explicit approval
- Always write the migration before touching the React code

## This sub-task
[Specific goal in 1-2 sentences]

## Files to read before starting
[List relevant files]

## Constraints
[Anything that limits the solution]

## Deliverable
[What files should change]

## Definition of Done
[How we'll know it worked]
```

### ג. הרצה

```bash
cd "C:\dev\simplicity"
claude -p "<הפרומפט המלא>"
```

לפרומפטים ארוכים:
```bash
cat > /tmp/cc_prompt.txt << 'EOF'
<הפרומפט>
EOF
cd "C:\dev\simplicity"
claude -p "$(cat /tmp/cc_prompt.txt)"
```

### ד. עיבוד הפלט

- בדוק שהקבצים שצוינו אכן השתנו
- אם נוצרה migration — ודא שהיא כוללת לוגיקת שמירת דאטה
- אם עלתה החלטה חדשה תוך כדי — **עצור** ופנה למשתמש

### ה. דיווח למשתמש (פר תת-משימה)

2-3 משפטים בעברית מילולית. מה נעשה, מה השתנה, מה הבא.

### ו. טבלת תפיסת בעיות

| מצב | פעולה |
|---|---|
| תת-המשימה הצליחה | דווח + המשך לבאה |
| חסר מידע, לא חוסם | דלג, סמן לסיכום, המשך |
| חסר מידע, חוסם | עצור, שאל משתמש |
| שינוי סכמה בלי migration | עצור, כתוב migration קודם |
| Claude Code הציע החלטה חדשה | עצור, הצג למשתמש, חכה לאישור |
| Claude Code נכשל | נסה לתקן פעם אחת. אם לא — עצור, שאל |

---

## שלב 5 — Final Summary

סיכום בעברית מילולית:
- מה נעשה
- מה דולג ולמה
- החלטות חדשות שאושרו
- קבצים שהשתנו (בלשון פשוטה)
- האם יש migration שצריך להריץ בסופבייס?

בקש מהמשתמש לעבור על העבודה ולאשר.

---

## יעילות ביצוע — חיסכון בטוקנים וזמן

**הבעיה שחוזרת:** הוספת פקודות `echo "boundary"` / `echo "b"` מיותרות כדי "לרוקן" תוצאות. זה מבזבז עשרות קריאות בלי תועלת ומאט את הסשן. **אל תעשה את זה.**

- **אסור** `echo` רק כדי "להמתין" או "לרוקן" buffer. כלי מחזיר תוצאה מיד — אין צורך בצעד נוסף.
- **פקודות תלויות זו בזו** → אחד אותן בפקודה אחת עם `;` או `&&` (למשל `git add … ; git commit … ; git push …`), במקום ריצה נפרדת + boundary בין כל אחת.
- **פקודות בלתי-תלויות** → שלח אותן כקריאות מקבילות באותה הודעה (tool batch אחד), לא בזו אחר זו.
- **קריאת קבצים:** קרא קובץ פעם אחת. אל תקרא שוב "לאמת" אחרי Edit/Write — הכלי כבר מאשר הצלחה. אם Edit נכשל ("String not found") — קרא את הקטע הרלוונטי פעם אחת והעתק טקסט מדויק, אל תנחש שוב ושוב.
- **ל-CLI אינטראקטיבי** (login/link וכו') — תן למשתמש להריץ; אל תנסה לעקוף עם echo/בדיקות.

## אימות בפריוויו ללא התחברות (mock mode)

האפליקציה חוסמת כל מסך מאחורי התחברות Supabase, ו-Claude **לא יכול** להתחבר (אסור להזין סיסמה / OAuth / signIn תוכנתי). כדי לאמת ויזואלית את האפליקציה המחוברת בפריוויו המקומי — השתמש במצב ה-mock המובנה (אין צורך שהמשתמש יסביר כל פעם):

1. הפעל את שרת הפיתוח: `preview_start` עם config `vite` (פורט 5174).
2. טען את האפליקציה עם **`?mock=1`** ב-URL — או הרץ `localStorage.setItem('PREVIEW_MOCK','1')` ואז reload.
3. `src/lib/supabase.js` מחליף את ה-client ל-mock (`src/lib/mockSupabase.js`) עם נתוני `src/data/mock.js`: session מזויף + prefs מלאים (אונבורדינג מסומן כהושלם), כך שהאפליקציה נוחתת על הבית. בלי auth, בלי רשת, בלי סיסמה.
4. אז אפשר `preview_snapshot` / `preview_screenshot` / `preview_eval` לאימות רגיל.

**בטיחות (חשוב):** פעיל **רק ב-DEV ורק עם ה-flag**. ב-build של פרודקשן `import.meta.env.DEV===false` → הקוד נמחק לגמרי (tree-shaken; אומת שאין זכר ב-`dist`). אפס השפעה על משתמשים אמיתיים או על כניסות אמיתיות; ה-flag יושב ב-localStorage של דפדפן הפריוויו של Claude Code בלבד.

הערה: hooks שמייצרים רשומות (פגישות / הוראות קבע) עלולים להוסיף אזהרת `duplicate key` בקונסול תחת StrictMode — רעש dev בלבד, אפשר להתעלם.

## זרימת Git (פרויקט סימפליסיטי)

ה-repo נמצא בשורש `C:\dev\simplicity` (האפליקציה היא שורש הריפו, לא תת-תיקייה). קבצי המפרט/אסטס יושבים ב-`C:\dev\simplicity-assets`. ברירת המחדל: `origin/main`, עבודה ב-feature branches שממוזגים ל-main עם merge commit.

זרימה סטנדרטית — **אשר עם המשתמש לפני push/merge**, ואז הרץ צעדים מאוחדים:
1. `git checkout -b feat/<שם>`
2. `git add <קבצים ספציפיים>` — לא `git add .` עיוור. השאר בחוץ קבצים זמניים (`supabase/.temp/`) ושינויים לא-קשורים.
3. `git commit -m "…"` — הודעה באנגלית, מסיים ב-`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
4. `git push -u origin feat/<שם>`
5. למיזוג (רק אחרי אישור מפורש): `git checkout main ; git merge --no-ff feat/<שם> -m "…" ; git push origin main`
6. ודא: `main == origin/main` (`git rev-parse main` מול `origin/main`).

`gh` **לא מותקן** בסביבה — אי-אפשר לפתוח PR אוטומטית. או למזג מקומית (אחרי אישור), או לתת למשתמש את הקישור ש-GitHub מחזיר אחרי push.

**אחרי כל merge/Edit — לבדוק בפועל, לא להניח.** עריכה יכולה להיכשל בשקט (no-match) ו-merge יכול להעלות רק חלק מהשינוי. אחרי מיזוג, grep את הקובץ הממוזג למחרוזת המדויקת ששינית (`git show main:path | grep …`). בסשן אמיתי כך נתפס באג שבו השולח התעדכן אבל `reply_to` נשמט.

## עבודה מול שירותים חיצוניים (Resend / API keys / דומיינים)

- **אל תניח שמשהו מוגדר נכון — בדוק בפועל.** secret, מפתח, אימות דומיין — הרץ קריאת בדיקה אמיתית וקרא את הסטטוס/השגיאה המדויקת לפני שממשיכים.
- שמות secrets רגישים לתווים: חייב להתאים **בדיוק** למה שהקוד מחפש (למשל `RESEND_API_KEY` — קווים תחתונים, בלי רווחים). שם תווית בצד השירות (Resend) לא רלוונטי.
- אימות דומיין הוא eventually-consistent — יכול להחזיר 403 ואז להצליח כמה דקות אחרי שה-DNS מתפשט. אם נכשל, אל תהפוך קוד שבור ל-main; החזר לגרסה העובדת ובדוק שוב.
- שינוי ששובר שירות חי (כמו כתובת שולח לא-מאומתת) — **לעולם לא ל-main לפני שבדיקה אמיתית חזרה ok**.

---

## כללי ברזל

- **לעולם** אל תשנה סכמה בלי migration שמשמר דאטה קיים.
- **לעולם** אל תעשה DROP על עמודה/טבלה בלי אישור מפורש + ודא שאין בה דאטה משתמשים.
- **לעולם** אל תנחש ערכי CSS — תמיד קרא את `tokens.css` לפני.
- **לעולם** אל תיצור hook חדש לפני שבדקת אם קיים ב-`hooks/`.
- **תמיד** הצג למשתמש קודם — אחר כך מממש.
- **לעולם** אל תוסיף פקודות `echo`/boundary מיותרות לריקון buffer — אחד פקודות תלויות בשורה אחת.
- **תמיד** אחרי merge/Edit — אמת את השינוי בקובץ בפועל (grep), אל תניח שהצליח.
- **לעולם** אל תמזג ל-main קוד שתלוי בשירות חיצוני בלי בדיקת שליחה אמיתית שחזרה ok.
- אם המשתמש אומר "המשך / רוץ עם זה" אחרי סיכום — זה אישור גורף.
