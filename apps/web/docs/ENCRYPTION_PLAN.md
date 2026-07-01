# Client-side field encryption — plan & open decisions

_Last updated: 2026-06-10. Status: **IMPLEMENTED, reviewed, verified (build + 27 crypto tests + independent code review).**_

**Encrypted fields (final):** `clients.phone`, `clients.notes`, `sessions.notes`, `sessions.summary`, `moon_snapshots.reflection` (reflections added per the review). NAMES stay plaintext. Architecture = api-layer choke point. Existing data = one-time per-user background re-encryption (guarded, paginated, resumable). See git log for the implementation + review fixes (C1 migration race, C2 key-failure lockout, M2 pagination, M3 resumable, H1 serialized prefs writes).

⚠️ **One-way:** once data is encrypted, code rolled back below the encryption commit would show `ENC:` gibberish. Fix forward — do not revert the encryption code.

## מה כבר נעשה (בטוח, לא משפיע על האפליקציה)

- ✅ `src/lib/crypto.js` — פרימיטיבים AES-256-GCM (Web Crypto בלבד). `deriveKey(userId)`, `encryptField`, `decryptField`.
- ✅ `src/context/CryptoContext.jsx` — גוזר מפתח פר-משתמש בכניסה, מחזיק אותו **בזיכרון בלבד**, חושף `{ encryptField, decryptField, isReady }`.
- ✅ 11/11 בדיקות עברו: round-trip בעברית, fallback ל-plaintext ישן, null/empty, idempotent (לא מצפין פעמיים), IV אקראי, ו**בידוד בין משתמשים** (מפתח של משתמש א' לא מפענח נתוני משתמש ב').
- ⏳ **שני הקבצים עצמאיים — לא מיובאים לשום מקום. אפס שינוי באפליקציה החיה.** החיווט מחכה להחלטות למטה.

## הסכמה
- AES-256-GCM. מפתח = `PBKDF2(userId + salt קבוע בקוד)`. בזיכרון בלבד, נגזר מחדש בכל כניסה.
- פורמט: `"ENC:" + base64(IV ‖ ciphertext)`. ערך בלי הקידומת = plaintext ישן, מוחזר כמו שהוא.

## מודל איום (חשוב להבין מה זה כן ולא נותן)
- ✅ מגן על הנתונים **at rest**: dump של ה-DB מראה ciphertext; מפתח של משתמש אחד לא קורא שורות של אחר.
- ✅ **משיג את המטרה שלך:** גם אתה כבעלים (עם service-role) **לא יכול לקרוא תוכן של משתמשים אחרים** — כי המפתח של כל אחד נגזר מה-userId שלו.
- ❌ **לא** מגן מפני מי שיש לו את ה-JS bundle **וגם** userId ספציפי (אין סוד שהמשתמש מספק). זו פרטיות-at-rest, לא E2E.

## היקף — מקורי מול מורחב
- **מקורי:** 4 שדות — `sessions.notes`, `sessions.summary`, `client_notes.content`, `clients.notes`.
- **מורחב (הבקשה שלך):** "כל נתוני הלקוח — שמות, מיילים, טלפונים, הכל." הבעלים רואה **שימוש בפיצרים**, לא **תוכן שהוזן**.

## מצאי השדות
- `clients`: **name, phone, notes** (טקסט). **אין עמודת email בלקוחות.**
- `sessions`: **notes, summary**.
- `client_notes.content`: **הטבלה לא בשימוש בקוד (0 שורות) — אין מה לחווט היום.**
- `leads`: name, phone, notes (מקביל ללקוחות — לא בהיקף המקורי; "נתוני לקוח"?).
- `projects` / `groups`: name.
- שדות שימוש (status, פיננסים, מונים, תאריכים, הוראות קבע) — **נשארים plaintext**. זה ה"שימוש" שאתה כן רואה.

## ⚠️ ההכרעות הקשות (אתה מחליט)

### 1. הצפנת `name` שוברת התאמת יומן בצד שרת — הכי משמעותי
ה-Edge Function `google-calendar` מתאים כותרות אירועי יומן מול **שמות** של clients/projects/leads/groups כדי לשייך אירועים אוטומטית. הוא רץ בשרת **בלי גישה למפתח**. אם השמות מוצפנים → הוא רואה ciphertext → **השיוך האוטומטי מפסיק לעבוד** (אירועים נשארים לא-משויכים; שיוך ידני בלבד).
- (א) **לא** להצפין name → לשמור התאמה. (סותר "להצפין הכל".)
- (ב) להצפין name, לקבל אובדן התאמה / להעביר התאמה לצד-לקוח (עבודה משמעותית).
- (ג) להצפין + לשמור "blind index" לחיפוש — מורכב.

### 2. מיון וחיפוש לפי name/phone הופכים לצד-לקוח בלבד
אי אפשר למיין/לסנן ב-DB. צריך למשוך הכל, לפענח, ואז למיין/לחפש בדפדפן. בסדר בקנה מידה של בטא.

### 3. עלות תצוגה
כל שם/טלפון/הערה בכל רשימה/כרטיס/drawer/ייצוא דורש פענוח אסינכרוני בטעינה (פענוח כל הסט פעם אחת בשכבת הנתונים).

### 4. אילו ישויות?
רק `clients`, או גם `leads` / `projects` / `groups`? ("נתוני לקוח" = clients + תוכן sessions באופן טבעי.)

### 5. ארכיטקטורה — איפה ההצפנה/פענוח
- **א' — שכבת hooks** (מפתח ב-context, כמו הספֵק). מפספס נתיבי כתיבה שלא דרך hooks (ייבוא CSV).
- **ב' — שכבת api** (מפתח משוקף למודול זיכרון שה-api קורא). נקודת חנק אחת מכסה הכל — **מומלץ**. סטייה קטנה מ"context בלבד" (עדיין memory-only).

## המסלול המומלץ (לדיון)
גישה דו-שכבתית:
- **שכבה 1 (להצפין עכשיו, אפס מחיר פיצ'רי):** שדות תוכן טהורים — `sessions.notes`, `sessions.summary`, `clients.notes`. לא משמשים להתאמה/מיון/חיפוש. רווח נקי. (= ה-4 המקוריים פחות client_notes הלא-בשימוש.) ארכיטקטורה: ב' (api).
- **שכבה 2 (צריך את ההכרעה שלך):** שדות מזהים — `name`, `phone`. הצפנתם היא מה ששובר התאמת יומן + מיון/חיפוש. החלט לפי §1–§4.

## שאלות פתוחות (כשתחזור)
1. התאמת יומן: לשמור שמות plaintext כדי לשמר אותה, או להצפין ולשכתב/לקבל אובדן?
2. סט שדות מדויק: clients name/phone/notes? + sessions notes/summary? + leads? + projects/groups?
3. אין עמודת email בלקוחות — התכוונת לשדה חדש שצריך להוסיף? למיילים של לידים? או למייל ההתחברות שלך (אי אפשר להצפין — זו זהות ה-auth)?
4. ארכיטקטורה א' מול ב' (אני ממליץ ב').
5. להתחיל שכבה 1 (שדות התוכן הבטוחים) מיד בזמן שמחליטים על שכבה 2?
