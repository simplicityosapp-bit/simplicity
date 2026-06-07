---
name: ship-to-main
description: >-
  Commit, merge, and push uncommitted changes to `main` following this repo's
  established git workflow (short-lived feature branch → one descriptive commit
  → `git merge --no-ff` with a `Merge: ...` message → push to origin/main), then
  update the matching Notion feedback item. Use whenever the user wants to ship /
  push / merge work to main, e.g. "תעשה פוש ומרג להגל", "תעלה ל-main",
  "commit and merge", "ship to main".
---

# Ship to main

מטרה: לקחת שינויים לא מקומיטים ולהעלות אותם ל-`main` **בדיוק** לפי הזרימה
ההיסטורית של הריפו, עם build כשער חובה, ולעדכן את Notion בסוף כל תיקון.

## הקשר חשוב על הריפו

- ה-git repo נמצא בשורש הפרויקט (`C:\dev\simplicity`). הרץ את פקודות ה-git מהשורש.
- הזרימה ההיסטורית (ראה `git log --graph`): לכל שינוי לוגי — branch קצר →
  commit אחד → חזרה ל-`main` → `git merge --no-ff` עם הודעה שמתחילה ב-`Merge: ` →
  `git push origin main`.
- `npm run lint` הוא `eslint .` על כל הריפו ו**נכשל מראש** (עשרות שגיאות
  קיימות בקבצים שלא נגעת בהם). לכן בצע lint **רק על הקבצים ששונו**, וודא
  שהשינוי *שלך* לא הוסיף שגיאות חדשות — אל תתקן חוב lint קיים שלא קשור.
- שורות: git על Windows מנרמל CRLF↔LF ב-commit. אם git מציג קבצים כ"שונו" שהם
  רק הבדלי סוף-שורה, בדוק עם `git diff --ignore-all-space --stat` והתעלם מרעש EOL.

## שלבים

1. **נעילה.**
   ```bash
   if [ -f .git/index.lock ]; then rm -f .git/index.lock; fi
   git status --short
   ```

2. **זיהוי השינויים.** הצג למשתמש את הקבצים האמיתיים ששונו (לא רעש EOL — בדוק עם
   `git diff --ignore-all-space --stat`) ושאל איך לקבץ לקומיטים. ברירת מחדל:
   **שינוי לוגי אחד = branch + merge אחד**. אם לא ברור — שאל, אל תנחש.

3. **שער build (חובה לפני כל commit).**
   ```bash
   npm run build
   ```
   נכשל → **עצור**. אל תקמט.

4. **Lint על הקבצים ששונו בלבד.**
   ```bash
   npx eslint <changed-file-1> <changed-file-2>
   ```
   שגיאה *שהשינוי שלך הוסיף* → תקן. שגיאה קיימת מראש שלא קשורה → רשום בדיווח,
   אל תחסום ואל תתקן אותה כאן.

5. **לכל שינוי לוגי — סבב branch/commit/merge.** `fix/...` לתיקון, `feat/...`
   לפיצ'ר. הודעת commit תיאורית; הודעת merge מתחילה ב-`Merge: `.
   ```bash
   git checkout main
   git checkout -b fix/<short-slug>
   git add <only-the-files-for-this-change>
   git commit -m "<Topic>: <what changed and why>"
   git checkout main
   git merge --no-ff fix/<short-slug> -m "Merge: <plain description>"
   ```
   שמור את ה-hash של ה-merge (`git rev-parse HEAD`). חזור על הסבב לכל תיקון.

6. **Push.**
   ```bash
   git push origin main
   ```

7. **עדכון Notion — חובה בסוף כל תיקון שבוצע.**
   לכל שינוי שמוזג, עדכן את פריט הפידבק התואם ב-Notion (אם יש כלי Notion זמין):
   - Data source: `collection://c2e8479e-b8c3-4282-bc6d-c760c88a68cb` (📥 פידבקים בטא).
   - מצא את הרשומה הרלוונטית לפי הכותרת/התיאור של התיקון.
   - **סטטוס → `טופל`**.
   - **הערות →** מה תוקן, אילו קבצים שונו, התאריך, ו-hash של ה-merge commit
     (וקישור ל-commit אם קיים).
   - אם אין פריט תואם, או ש-Notion לא זמין — ציין זאת מפורשות בדיווח הסיום.

8. **דווח** למשתמש: אילו branchים נוצרו, hash לכל merge, מה נדחף, ואילו פריטי
   Notion עודכנו.

## כללי ברזל

- `git add` **רק** את הקבצים של אותו שינוי לוגי — לעולם לא `git add .`.
- build חייב לעבור לפני **כל** commit.
- לעולם אל תעשה `git push --force`.
- אל תיגע בקבצים/סודות שלא קשורים לשינוי.
- **כל תיקון שמוזג → עדכון Notion תואם.** אל תסיים בלי לעדכן (או לדווח שלא היה ניתן).
- אם לא ברור איך לקבץ קומיטים, מה הודעת ה-merge, או איזו רשומת Notion — **שאל**.
