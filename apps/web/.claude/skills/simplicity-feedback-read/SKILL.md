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
- קריאה/כתיבה: דרך ה-edge `admin` עם טוקן מצומצם מקובץ מקומי gitignored `C:\dev\simplicity\.feedback-cli.env` (`FEEDBACK_FUNCTIONS_URL`, `FEEDBACK_CLI_TOKEN`) — הטוקן פותח **רק** את פעולות הפידבק. שליפה: `{"action":"feedback_list"}`; עדכון: `{"action":"feedback_update","id":"<uuid>",...}`.
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

שלוף את כל הפידבק דרך ה-edge וסנן צד-לקוח לשורות לא-מסווגות (`classification` ריק, `status <> rejected`):

```bash
curl -s -X POST "$FEEDBACK_FUNCTIONS_URL" -H "content-type: application/json" \
  -H "x-feedback-token: $FEEDBACK_CLI_TOKEN" -d '{"action":"feedback_list"}'
```

אם אין שורות לא-מסווגות — סיים בשקט.

> **פידבק שהגיע במייל ישיר** (לא דרך הטופס — נדיר): אין לו שורה. הוסף אותו דרך מסך אדמין → פידבקים (או שורת owner חד-פעמית `source='email'`), ואז סווג כרגיל.

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

לכל שורה, patch לפי `id` דרך ה-edge:

```bash
curl -s -X POST "$FEEDBACK_FUNCTIONS_URL" -H "content-type: application/json" \
  -H "x-feedback-token: $FEEDBACK_CLI_TOKEN" \
  -d '{"action":"feedback_update","id":"<uuid>","classification":"<bug|dev|unclear>","surface":"<technical|design|both>","platform":"<mobile|desktop|both|unknown>","title":"<כותרת>","notes":"<כיוון בדיקה — שורה אחת>"}'
```

(`platform` — עדכן רק אם השורה עדיין ריקה.) `status` נשאר `new` — הקריאה מסווגת, לא סוגרת.

ב-PowerShell שמור את ה-JSON לקובץ והעבר `--data-binary "@file"` (אחרת הגרשיים נאבדים והכותרת בעברית נחתכת). אל תסיים בלי שהשורה עודכנה — או שדיווחת במפורש שלא ניתן.

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
