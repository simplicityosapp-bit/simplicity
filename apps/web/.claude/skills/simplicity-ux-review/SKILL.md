---
name: simplicity-ux-review
description: Deep UX/UI review of a single screen (or explicit multi-screen flow) in the Simplicity app (סימפליסיטי). Surfaces where the experience is too complex, too long, or unclear for non-tech-savvy users, proposes concrete fixes, and flags missing features that would make the screen better. Also logs any technical bugs spotted along the way — does not fix anything without explicit approval. Always asks which screen to review before starting; never assumes or guesses the screen. Use whenever the user wants a UX/UI audit, wants to "polish" or "improve" a screen, or asks to review a screen's experience for clarity/complexity.
---

# Simplicity UX Review — Workflow Skill

## תפקיד

סקירת UX/UI מעמיקה למסך בודד (או flow שלם אם התבקש במפורש) באפליקציית סימפליסיטי. המטרה: לזהות היכן החוויה מורכבת מדי, ארוכה מדי, או לא ברורה — במיוחד עבור משתמשים שלא נינוחים עם טכנולוגיה (פרסונות מאיה/איתי) — ולהציע פתרון קונקרטי לכל ממצא. **תוך כדי הסקירה עצמה לא מתקנים כלום** — לא באג, לא שיפור, גם אם טריוויאלי. המימוש קורה באותו סשן, אחרי הסיכום ואישור המשתמש: קודם באגים טכניים, אחר כך שאר השיפורים המאושרים כתת-משימות בזו אחר זו.

---

## עקרונות ליבה

1. **שאל תמיד קודם איזה מסך.** אם המשתמש לא ציין מסך — שאל. אסור לנחש.
2. **היקף ברירת מחדל: מסך בודד.** flow של כמה מסכים רק אם התבקש במפורש.
3. **בזמן הסקירה: לא נוגעים בקוד.** כל ממצא — בין אם באג ובין אם שיפור UX — מתועד ומוצע, לא מיושם, עד שהסקירה כולה מסתיימת והוצגה למשתמש.
4. **סדר הביצוע אחרי אישור:** קודם באגים טכניים (לפי פקודת המשתמש), ואז שאר השיפורים המאושרים אחד-אחד כתת-משימות.
5. **המטרה רחבה מ"מורכבות":** גם ליטוש ויזואלי, גם איתור פיצ'רים חסרים שהיו משפרים את המסך — לא רק "לקצר/לפשט".
6. **קהל היעד תמיד בראש:** משתמש שלא נינוח עם טכנולוגיה, לא מכיר ז'רגון, רוצה לדעת מה לעשות בלי לחשוב.
7. **תקשורת בעברית, פרומפטים ל-Claude Code באנגלית.**
8. **פלט הסקירה עצמה: סיכום בצ'אט בלבד.** לא נכתב קובץ דוח.

---

## שלב 0 — פתיחה (חובה בכל הרצה)

שאל: **"איזה מסך תרצה שאסקור?"** (שם קובץ / component / תיאור ברור). אם המשתמש נתן שם מסך כבר בבקשה המקורית — אל תשאל שוב, המשך ישר לשלב 1.

אם המשתמש מבקש flow שלם — אשר את רשימת המסכים הכלולים לפני שממשיכים.

---

## שלב 1 — Context Load (אוטומטי)

קרא לפני כל סקירה. אם קובץ לא קיים — ציין ואל תמשיך בלעדיו.

### עיצוב
- `mangata-react/src/styles/tokens.css`
- `mangata-react/src/styles/screens.css`
- `mangata-react/src/index.css`

### פרסונות / design system
- כל קובץ שמתאר את פרסונות מאיה/איתי או עקרונות העיצוב (אם קיים כ-doc נפרד ברפו)

### המסך הנסקר
- קובץ ה-component עצמו
- ה-hook/ים הרלוונטיים מ-`hooks/`
- כל modal/sub-component שהמסך פותח

---

## שלב 2 — קריטריוני סקירה

| קטגוריה | מה לבדוק |
|---|---|
| **מורכבות פעולה** | כמה שלבים/קליקים כדי להשלים פעולה נפוצה במסך; אפשר לקצר? |
| **ז'רגון** | מונחים טכניים או לא אינטואיטיביים שמשתמש רגיל לא יבין |
| **עומס קוגניטיבי** | יותר מדי מידע/אפשרויות מוצגות בבת אחת |
| **בהירות ויזואלית** | היררכיה, ניגודיות, גודל טקסט, יישור RTL |
| **States חסרים** | loading / empty / error / success — האם כולם מטופלים וברורים |
| **עקביות** | האם המסך תואם tokens ופטרנים קיימים באפליקציה |
| **פיצ'רים חסרים** | משהו שהמשתמש היה מצפה למצוא כאן ואיננו |
| **באגים טכניים** | כל דבר שבור שנתקלים בו תוך כדי — מתועד בנפרד, לא מתוקן |

לכל ממצא: ציין פלטפורמה (מובייל / דסקטופ / שתיהן) אם רלוונטי.

---

## שלב 3 — פרומפט ל-Claude Code (אנגלית)

```
## Context
Simplicity app — Practice OS for Israeli coaches.
Repo root: C:\Users\Bnaya\OneDrive\Desktop\Mangata\

## Task: UX/UI review only — do NOT fix anything

## Screen(s) to review
[שם/נתיב המסך, או רשימת מסכים אם flow]

## Target audience lens
Non-tech-savvy users (personas Maya/Itai) — assume low tolerance for jargon,
long flows, or ambiguous states.

## Read these files first
- mangata-react/src/styles/tokens.css
- mangata-react/src/styles/screens.css
- [component file(s)]
- [relevant hook(s)]

## Review categories
Complexity/length of common actions, jargon, cognitive load, visual clarity,
missing states (loading/empty/error/success), consistency with tokens,
missing features that would improve the screen, and any technical bugs spotted.

## Output per finding
1. What (short description)
2. Why it hurts a non-tech-savvy user
3. Proposed fix (concrete, not vague)
4. Severity (critical / medium / low)
5. Platform (mobile / desktop / both)
6. Category (complexity / jargon / visual / missing-feature / bug)

Do NOT fix anything. Report only.
```

---

## שלב 4 — סיכום (פלט לצ'אט)

הצג למשתמש:

```
נסקר: [מסך]

שיפורי UX/UI מוצעים:
🔴 קריטי:
  - [ממצא] → [פתרון מוצע]

🟡 בינוני:
  - ...

⚪ נמוך / ניצה'ס:
  - ...

פיצ'רים חסרים שזוהו:
  - [פיצ'ר] → [למה זה יעזור]

באגים טכניים שנתקלנו בהם (לא תוקנו):
  - [תיאור] — [חומרה]
```

בסיום: **"נדבר על זה ונבין מה לעשות — אחרי אישור אפרק לתת-משימות ונתחיל לבצע."**
אל תתקן כלום בשלב הזה, גם אם הפתרון נראה טריוויאלי — זה מגיע רק בשלב 5.

---

## שלב 5 — ביצוע (אותו סשן, אחרי דיון ואישור)

1. **דיון:** לעבור עם המשתמש על הממצאים, לוודא מה מאושר לביצוע ומה לא.
2. **פירוק לתת-משימות:** כל ממצא מאושר הופך לתת-משימה נפרדת.
3. **סדר ביצוע:** קודם כל באגים טכניים שתועדו (לפי פקודת המשתמש), ורק אחר כך שאר השיפורים המאושרים — אחד-אחד, לא כולם במקביל.
4. **לכל תת-משימה** — להפעיל את אותם כללי ברזל כמו ב-`simplicity-fix`: שינוי עיצובי שלא נשען ישירות על tokens.css/screens.css דורש אישור נפרד; שינוי סכמתי דורש migration ששומר דאטה קיים; אחרי כל תת-משימה — דיווח קצר בעברית (מה תוקן/שופר, מה השתנה) לפני מעבר לבאה.
5. **פרומפט ל-Claude Code לכל תת-משימה** (אנגלית) — לכלול: תיאור הממצא, הפתרון המאושר, כללי העיצוב (`No external UI library`, `tokens.css only`, `RTL`, `Lucide icons only`), ואם רלוונטי — דרישת migration שומר-דאטה.

---

## כללי ברזל

- **לעולם** אל תתחיל סקירה בלי לדעת איזה מסך.
- **לעולם** אל תתקן/תיישם משהו תוך כדי שלב הסקירה עצמו (שלבים 0-4) — הכל מתועד ומוצע קודם.
- **תמיד**, אחרי אישור: באגים טכניים לפני שאר השיפורים.
- **תמיד** תעדף את נקודת המבט של משתמש לא-טכני.
- **תמיד** תן פתרון קונקרטי לכל ממצא, לא רק תיאור הבעיה.
- **לעולם** אל תכתוב קובץ דוח לסקירה עצמה — רק סיכום בצ'אט.
