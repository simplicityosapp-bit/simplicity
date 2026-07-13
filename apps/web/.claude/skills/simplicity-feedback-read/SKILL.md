---
name: simplicity-feedback-read
description: Triages beta user feedback directly in Supabase (public.feedback) — classifies each untriaged row, suggests an investigation direction, and writes the triage fields back. The admin screen is the human board. Does not fix anything — only reads, classifies, and documents. No Notion.
---

# Simplicity Feedback Reader — Workflow Skill

## תפקיד

מסווג פידבקים **ישירות ב-Supabase** (`public.feedback`), מציע כיוון קצר לבדיקה, וכותב את שדות ה-triage בחזרה לשורה. לא מתקן שום דבר. **אין יותר Notion** — מקור האמת הוא הטבלה, והלוח האנושי הוא מסך האדמין → פידבקים.

> **למה זה השתנה:** פידבק מהאפליקציה נכתב כשורה דורבנית ל-`public.feedback` (ה-hook `useFeedback` + edge `send-feedback` — "the row is the source of truth"). המייל הוא רק התראה. לכן אין צורך ליצור רשומה — רק להעשיר שורות שעדיין לא סווגו.

---

## גישה ל-Supabase (מקור האמת)

- טבלה: `public.feedback` · פרויקט EU `rdurkakzyymxhocvhufw`.
- קריאה/כתיבה: הרצת SQL דרך ה-**Supabase CLI המקושר** (service-role / סיסמת DB — אותו ערוץ שבו רצות מיגרציות). כשאין הרצה אוטומטית ב-env (אין סיסמה) — **הפק את ה-SQL להרצה ידנית ע"י הבעלים**, בדיוק כמו מיגרציה.
- צפייה/סימון אנושי: מסך אדמין → פידבקים (`AdminFeedback`).

### שדות ה-triage בטבלה (מיגרציה 0079)
| עמודה | ערכים |
|---|---|
| `status` | `new` (פתוח) · `in_progress` · `waiting_decision` · `done` · `rejected` |
| `classification` | `bug` · `dev` · `unclear` (הכרעת triage — **נפרד** מ-`type`, הדיווח העצמי של המשתמש) |
| `surface` | `technical` · `design` · `both` |
| `platform` | `mobile` · `desktop` · `both` · `unknown` |
| `title` | כותרת קצרה בעברית |
| `notes` | כיוון בדיקה (שורה אחת) + מאוחר יותר לוג התיקון |
| `type` (קיים) | `bug`/`idea`/`praise`/`other` — דיווח המשתמש, לרמז בלבד |
| `source` | `app` (טופס) · `email` · `manual` |

---

## עקרונות ליבה

1. **קרא והבן לפני שמסווג.** אם הפידבק עמום — `classification='unclear'`, לא לנחש.
2. **הדיווח העצמי (`type`) הוא רמז, לא אמת.** משתמש שסימן `bug` יכול לטעות — הסיווג הסופי (`classification`) נקבע לפי התוכן.
3. **כיוון קצר, לא ניתוח מעמיק.** שורה אחת ב-`notes` — היכן לחפש + רמת ביטחון. זהו.
4. **תעד הכל.** כל שורה מסווגת, גם `praise` (→ `unclear`, בלי להקדיש זמן חשיבה).
5. **בלי כפילויות.** לא יוצרים שורות חדשות לפידבק-אפליקציה — הוא כבר קיים. רק מעשירים.
6. **תקשורת בעברית.**

---

## שלב 1 — שליפת שורות לא-מסווגות

הרץ (או הפק) את ה-SQL:

```sql
SELECT id, created_at, message, type, platform, status
FROM public.feedback
WHERE classification IS NULL
  AND status <> 'rejected'
ORDER BY created_at ASC;
```

אם אין שורות — סיים בשקט.

> **פידבק שהגיע במייל ישיר** (לא דרך הטופס — נדיר): אין לו שורה. הוסף אותה ידנית:
> `INSERT INTO public.feedback (user_id, message, type, source, status) VALUES ('<uid>', '<text>', '<type|null>', 'email', 'new');`
> ואז המשך לסווג אותה כמו כל שורה.

---

## שלב 2 — קריאת קבצי הקשר (רשימה בלבד)

קרא את **רשימת הקבצים** בלבד — לא תוכן. פתח קובץ ספציפי רק אם רלוונטי לפידבק ספציפי.

> מונוריפו pnpm: קוד הווב תחת `apps/web/src/`, ו-`supabase/` בשורש.

- `apps/web/src/hooks/` — רשימת hooks (שמות בלבד)
- `supabase/schema.sql` — רשימת טבלאות (שמות בלבד)
- `C:\dev\simplicity-assets\analytics-formulas.md` — כותרות בלבד
- `C:\dev\simplicity-assets\desingh.checklist.md` — כותרות בלבד

---

## שלב 3 — סיווג לכל שורה

### א. `classification`
| קריטריון | ערך |
|---|---|
| תיאור של דבר שלא עובד (או `type='bug'`) | `bug` |
| בקשה לפיצ'ר / שיפור חדש (או `type='idea'`) | `dev` |
| `praise` / `other` / עמום | `unclear` |

### ב. `surface`
| קריטריון | ערך |
|---|---|
| לוגיקה, חישוב, שגיאה, ביצועים | `technical` |
| מראה, פונט, צבע, פריסה, זרימה | `design` |
| שילוב | `both` |

### ג. `platform`
אם השורה כבר נושאת `platform` (זוהה אוטומטית בטופס) — השאר. אחרת הסק מהטקסט (`mobile`/`desktop`), או `unknown`.

### ד. `title` + `notes`
- `title`: תיאור קצר וברור בעברית.
- `notes`: כיוון בדיקה בשורה אחת. דוגמה: `useTransactions / recurring_templates — בדוק insert. ביטחון: בינוני.`

---

## שלב 4 — כתיבת ה-triage בחזרה

לכל שורה, הרץ (או הפק) UPDATE ממוקד לפי `id`:

```sql
UPDATE public.feedback
SET classification = '<bug|dev|unclear>',
    surface        = '<technical|design|both>',
    platform       = COALESCE(platform, '<mobile|desktop|both|unknown>'),
    title          = '<כותרת>',
    notes          = '<כיוון בדיקה — שורה אחת>'
WHERE id = '<uuid>';
```

`status` נשאר `new` (פתוח) — הקריאה לא סוגרת פריטים, רק מסווגת.

---

## שלב 5 — סיכום ריצה

```
סיכום ריצה — [תאריך ושעה]

📋 שורות שסווגו: X

🔴 bug: X (technical: X / design: X)
🟣 dev: X
🟡 unclear: X

מקור: public.feedback · צפייה: מסך אדמין → פידבקים
```

---

## כללי ברזל

- **לעולם** אל תתקן שום דבר — רק סווג ותעד.
- **לעולם** אל תיצור שורה כפולה לפידבק-אפליקציה — הוא כבר קיים ב-`public.feedback`.
- **לעולם** אל תפתח קובץ מהריפו אלא אם ישירות רלוונטי לפידבק.
- כיוון הבדיקה — שורה אחת, לא ניתוח.
- **אין Notion.** מקור האמת = `public.feedback`; הלוח = מסך האדמין.
