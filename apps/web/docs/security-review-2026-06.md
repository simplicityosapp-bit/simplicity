# סקירת אבטחה מקיפה — Simplicity (סימפליסיטי)

**תאריך:** 2026-06-13
**היקף:** כל בסיס הקוד — Frontend (React 19 + Vite SPA), שכבת ה-API מול Supabase, מדיניות ה-RLS וה-migrations, ארבע ה-Edge Functions (Deno), הצפנת השדות, תהליכי auth/consent/מחיקת-חשבון, ייבוא/ייצוא, ותצורת הפריסה (Vercel).
**שיטה:** ביקורת רב-סוכנית — 9 סוכני־מחקר מקבילים לפי דומיין אבטחה, ואחריהם שלב אימות יריב (adversarial verification) שבו כל ממצא לא-טריוויאלי אושר/הופרך מול הקוד עצמו. סה"כ **66 ממצאים**, מתוכם 29 עברו אימות עצמאי (19 אושרו, 6 חלקית, 3 "דורש החלטה", 1 הופרך), בתוספת בדיקה ידנית של הקבצים הקריטיים.

> **קריאה חשובה לגבי חומרה:** סימפליסיטי בנוי נכון בליבה — כל טבלה מוגנת ב-RLS אחיד (`user_id = auth.uid()`), אין מפתח service-role ב-frontend, אין XSS sinks (אין `dangerouslySetInnerHTML`/`innerHTML`/`eval`), והבידוד הרב-דיירי (multi-tenant) תקין. **לא נמצאה דליפת-מידע חוצת-דיירים ולא עקיפת-הרשאות אקטיבית.** מרבית הממצאים שדורגו "high" בגלם הורדו ל-medium/low באימות היריב, כי הם דורשים תנאי-קדם (DB dump, session גנוב, או XSS עתידי). זו ביקורת קפדנית בכוונה — אל תקרא את כמות הממצאים כפאניקה; קרא את **טבלת העדיפויות** למטה.

---

## 1. תקציר מנהלים

| חומרה (לאחר אימות) | כמה | סטטוס |
|---|---|---|
| 🔴 ארכיטקטורי/משפטי (החלטה פתוחה) | 12 נושאים | **לטיפול משותף** — סעיף 4 |
| 🟠 טכני ברור (תוקן עכשיו) | 10 תיקונים | **בוצע** — סעיף 3 (דורש פריסה) |
| 🟡 המלצות המשך | 10 נושאים | מתועד, עדיפות נמוכה/דורש זהירות — סעיף 5 |

**שלושת הדברים הכי חשובים לקרוא:**
1. **הצפנת השדות אינה מגינה מפני האיום שלשמו נבנתה.** המפתח נגזר מ-`PBKDF2(user_id, APP_SALT)` — שני קלטים *ידועים* לתוקף: ה-`APP_SALT` קבוע בתוך ה-bundle הציבורי, וה-`user_id` מופיע ב-plaintext בכל שורה. מי שמשיג dump של ה-DB יכול לפענח אופליין 100% מהשדות ה"מוצפנים" (`OD-1`).
2. **מדיניות הפרטיות מצהירה הצהרת-יתר** — "רשומות לקוח מוצפנות ואינן קריאות לצוות" — בעוד שם/טלפון/אימייל נשמרים גלויים והמפתח ניתן לגזירה. זו חשיפה משפטית (`OD-2`).
3. **הסכמה (consent) ומחיקת-חשבון נאכפות רק בצד-לקוח**, ורשומת ההסכמה ניתנת לזיוף בידי המשתמש עצמו — מערער את הערך הראייתי שלה ל-GDPR (`OD-4`, `OD-7`).

---

## 2. מתודולוגיה ומודל-איום

**מודל-האיום הרלוונטי לאפליקציה הזו:**
- **רב-דיירות (multi-tenant):** מאמן A לעולם לא יראה/ישנה נתוני מאמן B. ← **תקין.** RLS אכיף על כל הטבלאות.
- **PII רגיש:** שמות/טלפונים/אימיילים של לקוחות-קצה, הערות פגישה, רפלקציות אישיות, נתונים כספיים, לידים.
- **התוקף הריאלי:** (א) משתמש מאומת זדוני שמנסה לצאת מהדייר שלו; (ב) מי שמשיג dump של ה-DB / backup / מפתח service-role; (ג) דף זדוני שמנסה CSRF/clickjacking על מאמן מחובר; (ד) XSS עתידי או תלות פגיעה.

**גבולות אמון מרכזיים:** הדפדפן (anon key + JWT) → Supabase REST (נשען על RLS); הדפדפן → Edge Functions (service-role, עוקף RLS — כאן באגי-authz הם קריטיים); Edge Functions → Google/Resend.

---

## 3. מה שכבר תוקן (תיקונים טכניים ברורים)

כל התיקונים הוחלו, ה-build עובר, ו-191 הבדיקות (vitest) עוברות. **שינויי ה-Edge Functions וה-`vercel.json` דורשים פריסה כדי להיכנס לתוקף** — ראו "צ'קליסט פריסה" בסוף.

| # | תיקון | קובץ | ממצא |
|---|---|---|---|
| F-1 | **ניטרול הזרקת-נוסחאות ל-CSV/Excel** — תאים שמתחילים ב-`= + - @`/TAB/CR מקבלים prefix `'` (CSV + XLSX). **מספרי טלפון (`+972…`) ומספרים מוחרגים** (ערך שמורכב רק מספרות וסימני-טלפון לא יכול לשאת payload), כך שהייצוא נשאר נקי וניתן לייבוא-חוזר | `src/lib/export.js` | #4/#19 |
| F-2 | **שמירת `decOrFlag` על שדה `notes`** בשני sinks שדלגו עליו (ה-CSV של לקוחות + גליון הלקוחות ב-XLSX) — מונע כתיבת `ENC:` גולמי לקובץ | `src/lib/export.js` | #35 |
| F-3 | **`purge-deleted-accounts` נכשל-סגור (fail-closed)** — אם `CRON_SECRET` לא מוגדר, הפונקציה מסרבת לכל בקשה במקום לרוץ ללא אימות; הוספת השוואה constant-time | `supabase/functions/purge-deleted-accounts/index.ts` | #2/#7/#24 |
| F-4 | **ביטול הרשאת Google במחיקת חשבון** — ה-purge מבטל את ה-refresh_token מול Google *לפני* המחיקה (כמו נתיב ה-disconnect), כדי שההרשאה לא תישאר חיה אצל Google | `supabase/functions/purge-deleted-accounts/index.ts` | #11 |
| F-5 | **`send-feedback` דורש JWT תקין** + תקרת אורך (message 5000, device 120) — סגירת וקטור ספאם/עלויות Resend ללא אימות | `supabase/functions/send-feedback/index.ts` | #13/#16/#29 |
| F-6 | **הסרת דליפת שגיאות גולמיות ללקוח** — `send-feedback`, `purge`, ו-`google-calendar` מחזירים שגיאה גנרית ומלוגגים את הפרטים בצד-שרת (במקום `String(e)` / גוף-תגובה של Google/Resend) | 3 edge functions | #30/#41/#50 |
| F-7 | **שער ה-admin דורש `email_confirmed_at`** + ולידציית פורמט-UUID על `delete_user`/`set_subscriber` (מונע מחיקה בטעות של uid שגוי) | `supabase/functions/admin/index.ts` | #55/#31 |
| F-8 | **כותרות אבטחת-HTTP ב-`vercel.json`** — HSTS, X-Frame-Options: DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy (אכיפה), + **CSP במצב Report-Only** (אפס סיכון לשבירה) עם hash של ה-inline script | `vercel.json` | #6/#20/#25 |
| F-9 | **ניקוי cache (react-query) בכל החלפת-זהות** ולא רק ב-SIGNED_OUT — מונע הצגת שורות של משתמש קודם אם תיווסף החלפת-חשבון | `src/auth/AuthProvider.jsx` | #40 |
| F-10 | **תצפיתיות על כשל-פענוח** — `decryptField` מלוגג `console.warn` (סוג-השגיאה בלבד, לעולם לא ה-plaintext) במקום בליעה שקטה | `src/lib/crypto.js` | #15 |
| F-11 | **ולידציית סכום כספי** — דחיית NaN/Infinity/שלילי/ענק ב-`insertTransaction`/`updateTransaction` (ה-UI אינו גבול-אמון מול PostgREST) | `src/lib/api/transactions.js` | #38/#53 (חלקי) |
| F-12 | **תקרת גודל קובץ ייבוא (20MB)** ב-`parseFile` — לפני קריאה/פענוח, למניעת קריסת-טאב | `src/lib/csvImport.js` | #39 (חלקי) |

> הערה ל-F-8 (CSP): ה-CSP נשלח כ-`Content-Security-Policy-Report-Only` בכוונה — הוא **לא חוסם דבר**, רק מדווח הפרות ל-console. הכותרות האחרות אוכפות מיד ובטוחות. כדי להפוך את ה-CSP לאוכף: לאחר פריסה, פתחו את האפליקציה, ודאו שאין הפרות ב-console (במיוחד style-src/connect-src), ואז שנו את שם הכותרת מ-`Content-Security-Policy-Report-Only` ל-`Content-Security-Policy`. ה-hash של ה-inline script כבר אומת מול ה-`dist/index.html` הבנוי.

---

## 4. החלטות פתוחות — לטיפול משותף 🔴

אלה דורשות החלטת מוצר/ארכיטקטורה/משפט, או בלתי-הפיכות, או נוגעות בזרימה חיה שלא ניתן לבדוק headless. **לא נגעתי בהן.**

### OD-1 — הצפנת השדות אינה מגינה מפני dump של ה-DB *(ליבת הסקירה)*
**קובץ:** `src/lib/crypto.js:25-60`, `src/context/CryptoContext.jsx:41`
המפתח: `key = PBKDF2-SHA256(password = user_id, salt = APP_SALT, 100k)`. שני הקלטים ציבוריים — `APP_SALT` הוא קבוע ב-bundle (ניתן להורדה מ-simplicity-os.com), ו-`user_id` הוא ה-UUID שמופיע ב-plaintext בעמודת `user_id` של *אותה שורה* שהערכים שלה "מוצפנים", וגם ב-JWT. לכן: מי שמשיג dump של ה-DB (backup דלוף, פרויקט Supabase שנפרץ, insider, דיסק אבוד) יכול, לכל שורה, לגזור את מפתח המשתמש מה-`user_id` שלה + ה-salt הציבורי ולפענח אופליין את **כל** ה-`clients.notes`/`sessions.notes`/`sessions.summary`/רפלקציות. 100k האיטרציות אינן מוסיפות ביטחון כי ה"סיסמה" (UUID) ידועה. ה-docstring עצמו מודה: "privacy-at-rest, not E2E... does not protect against an attacker who has the bundle + a user id". הבעיה: ה-dump הוא בדיוק התרחיש שהפיצ'ר מוכר את עצמו כמגן מפניו.
**להחלטה:** איך מכניסים סוד אמיתי לגזירה — (א) סוד פר-משתמש בצד-שרת ב-Supabase Vault/KMS, נמסר ללקוח רק לאחר אימות דרך edge function (`key = HKDF(user_id, serverSecret)`); (ב) DEK עטוף ב-KMS; (ג) מפתח נגזר מסיסמת המשתמש (zero-knowledge אמיתי, אך נשבר למשתמשי OAuth ומסבך reset). מינימום: להוציא את `APP_SALT` מה-bundle לסוד שנמסר מהשרת. כרוך בהחלטות key-custody, שחזור, ומשתמשי OAuth.

### OD-2 — מדיניות הפרטיות מצהירה הצהרת-יתר על הצפנה *(חשיפה משפטית)*
**קובץ:** `src/components/legal/legalContent.js:42,58,62,206`
§6.2/§6.3/§4.2 וה-DPA אומרים ש"רשומות לקוח מוצפנות AES-256-GCM ואינן קריאות לצוות". בפועל: רק `notes`/`summary`/`reflection` מוצפנים; **שם/טלפון/אימייל גלויים** (migration 0026: email "Intentionally NOT encrypted"; phone עבר ל-plaintext), וגם השדות ה"מוצפנים" ניתנים לפענוח ע"י בעל ה-bundle (קרי הצוות — ראו OD-1). ההצהרה הגורפת לא מדויקת תחת חובת השקיפות/דיוק של GDPR והחוק הישראלי המצוטט.
**להחלטה:** לתקן את נוסח המדיניות שיהיה מדויק (איזה שדות מוצפנים בדיוק, ושהמזהים והכספים אינם מוצפנים-במנוחה), ולהסיר/לסייג את "אינו קריא לצוות". מתחבר ל-OD-1 ו-OD-3.

### OD-3 — שם/טלפון/אימייל/כספים נשמרים plaintext at rest
**קובץ:** `src/lib/fieldCrypto.js:18-32`, `supabase/migrations/0026_clients_email.sql`
המזהים המסוכנים ביותר (שם, טלפון, אימייל) והכספים — דווקא הם בגלוי, בעוד הערות חופשיות מוצפנות. אם ה-DB דולף מתקבלת רשימת לקוחות + טלפונים + אימיילים מוכנה ל-phishing/smishing של לקוחות-קצה פגיעים (הקשר טיפולי/אימוני). זו החלטה מודעת ומתועדת (calendar matching, מיון/חיפוש, אינטגרציות חיוב), אבל היא ההפך מסדר-העדיפויות של מינימיזציה.
**להחלטה:** לקבל ולתעד את הסיכון (עם בקרות גישה קשיחות ל-DB + backups מוצפנים), או להרחיב הצפנה לטלפון/אימייל (בכפוף לפתרון OD-1, אחרת זה חסר-ערך).

### OD-4 — הסכמה נאכפת רק client-side + רשומת ההסכמה ניתנת לזיוף
**קובץ:** `src/lib/legal.js:51-83`, `src/lib/api/consentLog.js:19-28`, `src/App.jsx:284-297`, `src/components/legal/PolicyUpdateModal.jsx:30`, `migrations/0029`
(א) האם משתמש חייב (לאשר מחדש) נקבע client-side מתוך `user_metadata`, וההשלכה היחידה היא מודאל React; אין בדיקה server-side לפני קריאה/כתיבה של נתונים. משתמש יכול לדלג לגמרי (לקרוא ישירות ל-API, או לעדכן `user_metadata.*_version` בעצמו). (ב) טבלת `user_consent` מתוארת כ"מקור-אמת אימ-יוטבילי שלא ניתן לזייף", אבל ה-*שורות* נבנות מ-`user_metadata` (שהמשתמש שולט בו דרך `updateUser({data})`) ומוכנסות ע"י ה-session של המשתמש עצמו — כולל `accepted_at`/`version`/`accepted` שהלקוח בוחר. RLS מאמת רק `user_id`, לא את התוכן. אין trigger שדורס `accepted_at=now()`. לכן הרשומה ניתנת לזיוף/הכחשה — לא ניתן להוכיח שמשתמש אישר גרסה מסוימת בזמן מסוים.
**להחלטה:** לרשום consent בצד-שרת בנקודת-האמון — edge function (service-role) שחותם `accepted_at = now()` ו-`version`/`source` מהמסלול המאומת, ולעולם לא לקבל ערכים מהלקוח לרשומה המשפטית. או trigger ב-DB שדורס `accepted_at`/`created_at`. (קשור ל-#59.)

### OD-5 — JWT ב-localStorage: כל XSS = השתלטות מלאה ומתמשכת
**קובץ:** `src/lib/supabase.js:31-37`
Supabase שומר access+refresh token ב-localStorage (קריא לכל JS באתר; ה-refresh ארוך-טווח ומתחדש אוטומטית). זה ה-tradeoff הסטנדרטי של Supabase SPA, ו**כרגע אין XSS sink בקוד** — אבל אם יופיע (תלות פגיעה, CDN שנפרץ, `dangerouslySetInnerHTML` עתידי), התוקף גונב את ה-token ומשחזר אותו מכל מקום מול ה-REST. RLS לא עוזר (ה-token נושא auth.uid תקף), וגם השדות המוצפנים נפתחים (המפתח נגזר מ-userId — OD-1).
**להחלטה:** לקבל ולפצות — להפוך את ה-CSP לאוכף (F-8 כבר מכין זאת), לשקול refresh-token rotation + קיצור TTL ב-Supabase, ולנעול/לוונדר את xlsx (OD-11). פתרון מבני (session ב-cookie דרך proxy) הוא שינוי גדול.

### OD-6 — ייצוא PII מלא ללא re-auth וללא audit
**קובץ:** `src/modals/ExportDataModal.jsx:37-48`, `src/lib/exportSensitive.js`, `src/lib/export.js:138-265`
לחיצה אחת מורידה XLSX עם כל ה-PII כולל ההערות המפוענחות, ללא הזנת-סיסמה חוזרת וללא רישום server-side. session גנוב/מושאל יכול לשאוב הכול בשקט. (האימות היריב ציין שזו לא עקיפת-בקרה — תוקף עם session כבר יכול לקרוא ישירות — אך ה-re-auth + audit עוזרים למקרה "מכשיר מושאל" ולחקירה בדיעבד.)
**להחלטה:** האם לדרוש step-up auth + לוג ייצוא server-side (מי/מתי/אילו קטגוריות)? ערך מוגבל לאור OD-1/OD-5, אך מקרה המכשיר-המושאל אמיתי.

### OD-7 — נעילת "חשבון בתהליך מחיקה" היא client-side בלבד
**קובץ:** `src/App.jsx:95,142-149`, `src/components/AccountDeletionPending.jsx`, `src/lib/api/account.js:88-98`
בקשת מחיקה כותבת רק `prefs.accountDeletion` ל-`user_preferences` (כתיב ע"י המשתמש), והנעילה היא React gate. במהלך 30 הימים החשבון נגיש *מלא* דרך ה-API; אפשר גם לבטל את הבקשה ע"י עריכת ה-prefs. (לא עקיפה חוצת-דייר — המשתמש על הנתונים של עצמו — אבל פער-ציפיות: נראה "קפוא" ואינו.)
**להחלטה:** מצב-מחיקה אוטוריטטיבי בצד-שרת (טבלת service-role / `banned_until` ב-auth), ולנתב ביטול/אישור דרך edge function.

### OD-8 — DSR דרך Gmail אישי + מיילי feedback מדליפים תוכן ל-US
**קובץ:** `src/components/legal/legalContent.js:82-89`, `supabase/functions/send-feedback/index.ts`
זכויות נושא-מידע מטופלות ע"י מייל ל-`simplicity.os.app@gmail.com` ללא אימות-זהות/מעקב. בנפרד: `send-feedback` שולח את ה-feedback המילולי + אימייל-המשתמש דרך Resend (US) ל-Gmail — מאמן שמדווח באג עלול להדביק שם/טלפון של לקוח-קצה. שני שירותים אמריקאיים, מחוץ לגבול ה-EU, ותיבת Gmail הופכת ל-מאגר PII.
**להחלטה:** intake מסודר ומאומת-זהות ל-DSR (לא Gmail אישי), תיבה מבוקרת, הערת-UI שלא להדביק מזהי-לקוח, ומדיניות שמירה; לוודא ש-Resend + היעד מכוסים ב-DPA/subprocessors.

### OD-9 — OAuth CSRF: פרמטר `state` נוצר אך לא מאומת (אין PKCE)
**קובץ:** `supabase/functions/google-calendar/index.ts:330,335-352`, `src/screens/connections/index.jsx:94-109`, `src/hooks/useGoogleCalendar.js:53-58`
`auth-url` מגדיר `state=userId` אך `connect` לעולם לא בודק אותו, והלקוח לא קורא/שולח אותו בחזרה; אין PKCE. תרחיש: תוקף משיג `code` שקשור לחשבון-Google *שלו*, מפתה קורבן מחובר ל-`/connections?code=ATTACKER_CODE` (ה-useEffect מפעיל `completeConnect` אוטומטית), והטוקנים של התוקף נקשרים ל-`user_integrations` של הקורבן — אירועי-היומן של התוקף מסונכרנים ל-workspace של הקורבן (הזרקת-נתונים/פישינג). חומרה medium (הזרקה פנימה, לא דליפה החוצה; דורש קורבן מחובר; code קצר-חיים).
**מדוע נשאר פתוח:** התיקון הנכון דורש בחירת-עיצוב קטנה (nonce אקראי שמאוחסן ב-sessionStorage ומאומת, או state חתום), ונוגע בזרימת ה-OAuth החיה שלא ניתן לבדוק headless; תיקון חלקי (`state===userId` בלבד) נכשל מול תוקף שיודע את ה-userId של הקורבן. נטפל יחד עם פריסה מתואמת client+server.

### OD-10 — מפתחות-זרים חוצי-דייר אינם מאומתים ברמת ה-policy
**קובץ:** `supabase/schema.sql:854-889`, `src/hooks/useCalendarEvents.js`, status-log inserts
ה-`WITH CHECK` מאמת רק `user_id`, לא שה-FK (כגון `calendar_events.client_id`, `transactions.category_id`) שייך לאותו דייר. ה-FK של Postgres אוכף רק *קיום*. משתמש יכול להצביע משורה שלו ל-UUID של דייר אחר → oracle של קיום (FK violation אם לא קיים). **אין דליפת-קריאה** (RLS חוסם SELECT/JOIN), וה-UUIDs אינם נחושים, אז ההשפעה נמוכה — אבל זו פרצת-שלמות רב-דיירית פוטנציאלית ל-confused-deputy עתידי.
**להחלטה:** FK מורכב `(id, user_id)` או predicate co-ownership ב-`WITH CHECK` לטבלאות הרלוונטיות (שינוי DB). עדיפות נמוכה.

### OD-11 — שרשרת-אספקה: xlsx מ-CDN + חשבונות-בדיקה משותפים בפרודקשן
**קובץ:** `package.json:22`, `supabase/create-audit-user.mjs`, `supabase/create-test-user.mjs`
(א) `xlsx` נמשך מ-`cdn.sheetjs.com/...tgz` (לא מ-npm). הגרסה 0.20.3 מתוקנת ל-CVE-2023-30533 ו-CVE-2024-22363, ויש integrity hash ב-lockfile — אבל `npm audit`/Dependabot **לא רואים** dependency כ-URL, אז CVE עתידי יישאר בנקודה עיוורת. (ב) `create-audit-user.mjs` מקים חשבון קבוע `claude-audit@simplicity-os.com` על פרויקט הפרודקשן ושומר סיסמה ל-`.claude-audit-creds.json` (gitignored, אך בגלוי על דיסק).
**להחלטה:** לעבור ל-xlsx מ-registry (או mirror מתוחזק) לכיסוי audit, או לתעד תהליך-עדכון מתוזמן; להעדיף חשבונות-בדיקה חד-פעמיים עם teardown על-פני חשבון-audit קבוע בפרודקשן.

### OD-12 — תהליך איפוס-סיסמה אינו פונקציונלי
**קובץ:** `src/screens/auth/ResetPasswordScreen.jsx:23-25`, `src/App.jsx`, `src/auth/AuthProvider.jsx`
`resetPasswordForEmail` מפנה ל-`/login`, אבל אין מסך השלמה: אין `updateUser({password})` בשום מקום ואין מאזין ל-`PASSWORD_RECOVERY`. משתמש ש"שכח סיסמה" לוחץ על הקישור, מקבל session דרך הקישור (כי `detectSessionInUrl:true`) ונכנס לאפליקציה — בלי שאי-פעם הוצע לו לקבוע סיסמה חדשה. הפיצ'ר מת, וקישור-השחזור מעניק session שקט.
**להחלטה (feature work):** להוסיף route `/update-password`, מאזין ל-`PASSWORD_RECOVERY` שמנתב אליו, וטופס `updateUser({password})`. עד אז — לא לפרסם את הפיצ'ר.

---

## 5. המלצות המשך 🟡 (כיוון ברור, עדיפות נמוכה / דורש זהירות מעבר ל-auto-fix)

| # | המלצה | קובץ | ממצא |
|---|---|---|---|
| RF-1 | **CORS allowlist** במקום `*` בכל ה-edge functions (לא הוחל אוטומטית כדי לא לשבור `functions.invoke` אם origin חוקי יישמט — להחיל ולוודא בפריסה) | 4 edge fns | #32/#42/#46 |
| RF-2 | **sanitize → allowlist** + הסרת דגלים מיוחסים (`is_default`/`builtin`/`owned`/`confidence_score`/`matched_manually`/`google_event_id`) מ-mass-assignment. דורש זהירות פר-טבלה (ה-seeding מגדיר חלקם) | `src/lib/api/*.js`, `useCalendarEvents.js` | #52/#58 |
| RF-3 | **CHECK constraints** על שדות כספיים (`amount >= 0`, תקרה) + תקרת-גודל ל-`user_preferences` JSONB (migrations) | schema | #38/#53/#65 |
| RF-4 | **רענון `schema.sql`** מול ה-DB החי (מסיר `client_notes`/`session_attachments`/`reminder_occurrences` המתים מ-0027, מוסיף `user_consent`) + בדיקת CI ל-RLS-coverage (כל טבלה עם RLS חייבת policy, פרט ל-allowlist) | `supabase/schema.sql` | #21/#23/#45 |
| RF-5 | **audit log מובנה** לפעולות service-role (delete_user/purge/token writes) — שורה אימ-יוטבילית לפני המחיקה | edge fns | #56 |
| RF-6 | **clamp לחלון יצירת תנועות-חוזרות** (anchor מוגבל ל-12-18 חודשים אחורה) למניעת self-DoS דרך anchor רחוק | `src/lib/recurring.js` | #54 |
| RF-7 | **toast בכשל undo/redo** במקום בליעה שקטה (`catch {}`), + סנכרון ה-cache מתוצאת-השרת | `src/lib/undo.js`, `undoActions.js` | #66 |
| RF-8 | **soft-delete ל-`moon_snapshots`** (וללוגים) — סימטריית שחזור 30-יום עם שאר ה-PII | schema + `account.js` | #62 |
| RF-9 | **ולידציית `redirect_uri`** (allowlist origins) ב-google-calendar + אימות `new URL(url).origin === accounts.google.com` בצד-לקוח לפני ניווט | edge fn + `useGoogleCalendar.js` | #34/#61 |
| RF-10 | **Vercel Deployment Protection** ל-preview deployments (שלא יהיו ציבוריים) + החלת אותן כותרות אבטחה בכל הסביבות | Vercel dashboard | #63 |

---

## 6. דגשים חיוביים (מה שנעשה נכון)

- **RLS אחיד ונכון** על כל 30+ הטבלאות (`FOR ALL TO authenticated USING/WITH CHECK (user_id = auth.uid())`); תפקיד `anon` לא מקבל policies; `quotes` היחידה הקריאה-לכל (תקין).
- **`user_integrations` (טוקני Google) — RLS מופעל ללא policy = deny-all מכוון**; רק edge functions עם service-role נוגעים בטוקנים. הדפדפן לעולם לא רואה אותם. תבנית נכונה.
- **אין מפתח service-role ב-frontend** — `.env.local` מכיל רק `VITE_SUPABASE_URL` + anon (publishable) key. אין סודות ב-git (אומת).
- **אין XSS sinks** — אין `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function` בקוד. React escaping מגן כברירת-מחדל.
- **אין הזרקת PostgREST** — ה-`.or()`/`.filter()` שבקוד הם של JS arrays, לא string-interpolation לתוך מסנני PostgREST.
- **שערי ה-Edge Functions נכונים בליבה** — כולם גוזרים זהות מ-JWT (לא מ-body); `admin` מאמת אימייל-בעלים server-side; `purge` גוזר את רשימת-הקורבנות מזמן בלבד (לא מ-body).
- **encrypt fail-closed** — כתיבה ללא מפתח זורקת (לא נכתב plaintext בשקט); guard מפני הצפנה-כפולה.
- **המחיקה הרכה (soft-delete) + חלון 30 יום + cascade** מתוכננים היטב; ה-disconnect של Google מבטל טוקן נכון.

---

## 7. צ'קליסט פריסה (לתיקונים שהוחלו)

התיקונים בקוד ה-Frontend (F-1,2,9,10,11,12) ייכנסו לתוקף עם ה-deploy הרגיל (push → Vercel). השאר דורשים פעולה מפורשת:

1. **Edge Functions** (F-3,4,5,6,7) — לפרוס מחדש:
   `supabase functions deploy purge-deleted-accounts send-feedback google-calendar admin`
2. **⚠️ קריטי ל-F-3:** ודאו ש-`CRON_SECRET` **מוגדר** על הפונקציה *וגם* שה-cron schedule שולח אותו header (`supabase secrets list`). אחרי ה-fail-closed, אם הסוד לא מוגדר ה-purge יסרב לרוץ (כמתוכנן) — אבל המשמעות שאם הוא לא מוגדר היום, ה-cron יפסיק. זו בדיוק ההתנהגות הרצויה, רק לוודא שהסוד קיים.
3. **`vercel.json`** (F-8) — נכנס עם ה-deploy. לאחר מכן: ודאו ב-DevTools→Console שאין הפרות CSP, ואז הפכו את `Content-Security-Policy-Report-Only` ל-`Content-Security-Policy` (אכיפה).
4. **בדיקת עשן (smoke):** התחברות, רשומת feedback (עדיין עובדת — נשלחת מ-session מאומת), חיבור/סנכרון Google Calendar, ייצוא CSV/XLSX (ודאו שערכים עם `=` בתחילתם מקבלים `'`).

---

## 8. נספח — מיפוי כל 66 הממצאים

הממצאים המאומתים פורטו בסעיפים 3-5. רשימת הגלם המלאה (כולל 25 ה-low ו-12 ה-info), עם מיקום-קוד מדויק, תרחיש-ניצול ופסק-דין יריב לכל אחד, שמורה ב-`_audit_harvest.json` / `_audit_digest.txt` בשורש העבודה. ריכוז לפי דומיין:

- **Edge functions (11):** OAuth state CSRF (#1), purge fail-open (#2), send-feedback abuse (#13), header-injection (#14 — **הופרך**), raw errors (#30), admin input-validation (#31), CORS `*` (#32), input-size (#33), redirect_uri (#34), admin unverified-email (#55), no audit-log (#56).
- **Crypto (6):** key-derivation (#3), decrypt-swallow (#15), export-unguarded (#35), activeKey race (#36), migration-completeness (#37), IV reuse (#57 — בטוח בקנה-מידה).
- **Injection (5):** CSV formula (#4), feedback unbounded (#16), numeric bounds (#38), import memory (#39), sanitize denylist (#58).
- **Auth/session (7):** password-reset (#5), OAuth state (#17), JWT localStorage (#18), cache-not-cleared (#40), raw errors (#41), CORS (#42), pending-consent stash (#59).
- **Frontend/supply-chain (5):** CSP (#6→F-8), headers (#20), xlsx CDN (#43), APP_SALT/ADMIN_EMAIL in bundle (#60), oauth-url redirect sink (#61).
- **RLS (7):** schema stale (#21), cross-tenant FK (#22), rls_auto_enable (#23), purge fail-open (#24), status-log FK (#44), user_consent deploy-state (#45), moon_snapshots asymmetry (#62).
- **Infra (7):** CSP (#6), headers (#25), edge CORS/errors (#46), xlsx integrity (#47), shared test accounts (#48), SPA rewrite (#63).
- **Privacy/GDPR (11):** deletion grace client-side (#8), consent forgeable (#9), consent not server-enforced (#10), Google token not revoked (#11→F-4), full-export no-reauth (#12), feedback→Resend/Gmail (#26), policy overstates encryption (#27), plaintext PII (#28), calendar-title PII (#49), edge raw errors (#50), DSR manual (#51).
- **Business-logic (7):** send-feedback mailbomb (#29), mass-assignment flags (#52), no financial validation (#53), recurring amplification (#54), cross-tenant FK ref (#64), unbounded prefs blob (#65), undo silent-failure (#66).

---

## 9. עדכון — Supabase Security Advisor (2026-06-21)

לוח ה-Security Advisor המובנה של Supabase הציג 6 ממצאים. כולם טופלו או נסגרו עם נימוק. **4 תוקנו במיגרציה `0045_security_advisor_fixes.sql`** (הורצה), 2 נסגרו ללא קוד.

| # | ממצא | ישות | הכרעה |
|---|------|------|-------|
| SA-1 | Function Search Path Mutable | `public.set_updated_at` | ✅ **תוקן** — `SET search_path = ''` (0045) |
| SA-2 | Function Search Path Mutable | `public.user_consent_stamp` | ✅ **תוקן** — `SET search_path = ''` (0045) |
| SA-3 | Public Can Execute SECURITY DEFINER | `public.rls_auto_enable()` | ✅ **תוקן** — `REVOKE EXECUTE … FROM PUBLIC/anon/authenticated` (0045) |
| SA-4 | Signed-In Users Can Execute SECURITY DEFINER | `public.rls_auto_enable()` | ✅ **תוקן** — אותו REVOKE (0045) |
| SA-5 | Extension in Public | `public.pg_net` | ⏸️ **accepted / won't-fix** — ראו נימוק |
| SA-6 | Leaked Password Protection Disabled | Auth | ⛔ **מוגבל-תוכנית** — דורש Pro Plan |

**SA-1/SA-2 (search_path):** שתי הפונקציות הן trigger functions שמשתמשות רק ב-`now()` ו-`NEW.*`. ללא `search_path` קבוע, קריאת-שם תיאורטית עלולה להתפענח מול סכמה עוינת. אף אחת אינה `SECURITY DEFINER` (רצות כ-caller), אז החשיפה מינימלית — אבל הפינינג ל-`''` זול ונכון. (`rls_auto_enable` כבר היה מפונן נכון.)

**SA-3/SA-4 (rls_auto_enable):** זו **event-trigger function** — מופעלת אך ורק ע"י מנגנון אירועי-ה-DDL של Postgres, לעולם לא דרך `SELECT` ישיר. הרשאת ה-EXECUTE ל-PUBLIC חסרת-ערך מעשי, אבל ביטולה מנקה את שני הממצאים בבטחה מלאה.

**SA-5 (pg_net ב-public) — נסגר כ-won't-fix במכוון:**
`pg_net` רשום ב-namespace של `public` (מה שה-advisor מסמן), אבל הפונקציות שבשימוש בפועל נמצאות בסכמת **`net`** — אומת בשאילתה: `net.http_get` / `net.http_post`. שני ה-cron jobs (`invoice-poll`, `purge-deleted-accounts`) קוראים ל-`net.http_post`, כלומר **אינם נוגעים ב-public כלל**. הפקודה הסטנדרטית `ALTER EXTENSION pg_net SET SCHEMA extensions` מסוכנת: או שהיא נכשלת (אם pg_net לא relocatable, האזהרה נשארת), או שהיא מזיזה את `net.http_post` ל-`extensions.http_post` ו**שוברת את שני ה-cron בשקט**. התועלת קוסמטית, הסיכון תשתית-פרודקשן חיה → **משאירים כמו שזה**. אם בעתיד תידרש סגירה, יש לעשות זאת ידנית עם אימות מול ה-cron, לא במיגרציה עיוורת.

**SA-6 (Leaked Password Protection) — חסום-תוכנית:**
ההגדרה (Authentication → Providers → Email → "Prevent use of leaked passwords") זמינה רק ב-**Pro Plan ומעלה**; הניסיון להפעילה ב-Free מחזיר: *"Configuring leaked password protection via HaveIBeenPwned.org is available on Pro Plans and up."* נשאר פתוח־במכוון עד שדרוג ל-Pro (אם יוחלט). זו בדיקת-סיסמה מול HaveIBeenPwned ב-k-anonymity, חלה רק על סיסמאות חדשות — אפס השפעה על משתמשים קיימים.

**בקרה מפצה (חינמית) שנוספה ל-SA-6:** מאחר שה-HIBP חסום-תוכנית, נוסף gate בצד-לקוח ב-`src/lib/passwordStrength.js` (NIST 800-63B): מינימום **8 תווים** + דחיית סיסמאות נפוצות/דלופות מתוך blocklist (כולל וריאנט של ספרות-בסוף, למשל `password123`), ללא כללי-הרכב כופים. מחובר ל-`SignupScreen` ול-`UpdatePasswordScreen`. זו לא תחליף מלא ל-HIBP (blocklist קטן מול מסד-דליפות חי), אבל סוגר את הסיסמאות הגרועות-באמת בחינם. **להשלמה: יש להעלות גם את ה-Minimum password length בדאשבורד מ-6 ל-8** כדי שהאכיפה בצד-שרת תתיישר עם הלקוח.
