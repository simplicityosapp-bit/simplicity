/* ════════════════════════════════════════════════════════════════
   Guided tour registry — per-screen, multi-step spotlight walkthrough.
   ════════════════════════════════════════════════════════════════
   On first visit to a screen, <ScreenTour> walks these steps in order,
   spotlighting each target element with a warm one-liner. Steps whose
   `target` selector isn't present in the DOM (e.g. a widget the user
   disabled) are skipped automatically. The last step of a screen that
   has an Add CTA spotlights that button — folding the single-button
   coachmark into the tour so there's no double glow.

   Step shape:
     - target:    CSS selector for the element to spotlight.
     - title:     short heading (2-4 words).
     - body:      one warm, plain sentence on what it is / does.
     - radius:    optional spotlight corner radius (default 16px;
                  '50%' for the round CTA).
     - accent:    'sage' to tint the spotlight ring sage instead of
                  terracotta (used for the final CTA step). Optional.
   ════════════════════════════════════════════════════════════════ */

/* The home dashboard reuses the existing data-widget-id hooks as tour
   targets — no extra markup needed. Order follows top-to-bottom layout;
   missing widgets are skipped at runtime. */
const HOME_TOUR = [
  { target: '[data-widget-id="moon"]',      title: 'מבט על',          body: 'מבט על נותן הסתכלות מהירה על קצב ההתקדמות למול היעדים שלך. המספר הגדול מייצג את קצב ההתקדמות שלך — והמספר הקטן את האחוז הכללי מהיעד.' },
  { target: '[data-widget-id="insights"]',  title: 'שאלות יומיות',    body: 'השאלות שבחרתם יוצגו לכם כאן. המערכת דרכן תוכל לשקף לכם על ההתקדמות שלכם בכל רגע שתרצו — ותוכלו מכאן לעדכן בקלות כל יעד שתיצרו.' },
  { target: '[data-widget-id="quick-row"]', title: 'פעולה מהירה',     body: 'קיצור דרך לכל כפתורי ההוספה (משימות, הכנסות, לידים…). עדכון זריז זה בשביל לעדכן יעדים עם ערך מספרי שחייבים עדכון ידני.' },
  { target: '[data-widget-id="attention"]', title: 'הדורש תשומת לב',  body: 'אישור פגישות שנעשו, תשלומים שאמורים להתקבל, ועוד דברים שלא כדאי שייפלו בין הכסאות.' },
  { target: '[data-widget-id="reminders"]', title: 'תזכורות',         body: 'משימות שחוזרות על עצמן על בסיס שבועי, וכל דבר שהיית רוצה להזכיר לעצמך — זה המקום.' },
  { target: '[data-widget-id="next-tasks"]',title: 'משימות',          body: 'המשימות הכי דחופות יופיעו כאן.' },
  { target: '[data-widget-id="chips"]',     title: 'כרטיסי מצב',      body: 'הכרטיסים האלה הם תצוגות שתוכל להתאים אישית (תלחץ עליהם ואתה תבין).' },
]

/* Per-screen tours. Each ends on the round "+" CTA (radius 50%, sage
   ring) so the single-button coachmark folds into the walkthrough — no
   double glow. Steps whose target is absent are skipped at runtime. */
const CLIENTS_TOUR = [
  { target: '.c-tabs-row',    title: 'סטטוס הלקוחות', body: 'הלקוחות מחולקים לפי סטטוס: פעילים, ביניים (כאלה שקצת נעלמו) ולשעבר. הסטטוס נקבע לבד לפי הפעילות, ותמיד אפשר לשנות ידנית.' },
  { target: '.c-groupby',     title: 'קיבוץ',          body: 'אפשר לראות את הלקוחות לפי סטטוס, או מקובצים לפי הפרויקט שהם שייכים אליו.' },
  { target: '.s-hero',        title: 'סיכום מהיר',     body: 'פגישות, כמה שולם והיתרה הפתוחה של הקטגוריה. "חודשי" מראה את החודש הנוכחי, "מצטבר" את הכל מההתחלה.' },
  { target: '.c-select-btn',  title: 'בחירה מרובה',    body: 'מסמנים כמה לקוחות יחד כדי לשנות להם סטטוס או למחוק בבת אחת.' },
  { target: '.cta-add',       title: 'הוספת לקוח',     body: 'כאן מוסיפים לקוח חדש.', radius: '50%', accent: 'sage' },
]

const TASKS_TOUR = [
  { target: '.t-view',   title: 'משימות ותזכורות', body: 'משימות הן דברים לעשות בלי תאריך. תזכורות הן כל מה שיש לו דדליין — כאן עוברים ביניהם.' },
  { target: '.t-filter', title: 'סינון',            body: 'מציגים את הפתוחות, את שהושלמו, או את הכל.' },
  { target: '.cta-add',  title: 'הוספה',            body: 'כאן מוסיפים משימה או תזכורת חדשה.', radius: '50%', accent: 'sage' },
]

const LEADS_TOUR = [
  { target: '.l-view-toggle', title: 'קנבן וסטטוסים', body: 'קנבן מציג את הלידים כעמודות לפי שלב. "סטטוסים" זה איפה שמנהלים את רשימת השלבים עצמה.' },
  { target: '.l-stats',       title: 'תמונת מצב',      body: 'כמה פניות נכנסו החודש, כמה הפכו ללקוחות, ואחוז ההמרה ביניהם.' },
  { target: '.lead-board',    title: 'לוח הלידים',     body: 'כל עמודה היא שלב. גוררים ליד מעמודה לעמודה כדי לעדכן איפה הוא עומד.' },
  { target: '.cta-add',       title: 'ליד חדש',        body: 'כאן מוסיפים ליד חדש.', radius: '50%', accent: 'sage' },
]

const PROJECTS_TOUR = [
  { target: '.p-hero', title: 'סיכום הפרויקטים', body: 'כמה פרויקטים, כמה לקוחות משויכים וההכנסות. "חודשי/מצטבר" מחליף את טווח הסכומים.' },
  { target: '.p-list', title: 'כרטיסי הפרויקטים', body: 'כל כרטיס מרכז את הלקוחות, ההכנסות והמשימות הפתוחות ששייכים לפרויקט.' },
  { target: '.cta-add', title: 'פרויקט חדש',      body: 'כאן פותחים פרויקט חדש.', radius: '50%', accent: 'sage' },
]

const GOALS_TOUR = [
  { target: '.g-toolbar', title: 'קטגוריות',   body: 'היעדים מאורגנים בקטגוריות. מכאן מוסיפים קטגוריה חדשה.' },
  { target: '.g-group',   title: 'היעדים שלך', body: 'כל קטגוריה מרכזת את היעדים שלה. חלק מתעדכנים לבד מהנתונים, וחלק דורשים עדכון ידני.' },
  { target: '.cta-add',   title: 'יעד חדש',    body: 'כאן מוסיפים יעד חדש (קודם צריך קטגוריה אחת).', radius: '50%', accent: 'sage' },
]

const FINANCE_TOUR = [
  { target: '.f-hero',      title: 'סיכום החודש',     body: 'נטו, הכנסות והוצאות של החודש. החצים מחליפים בין החודשים, והתגיות הקטנות מראות שינוי מול החודש הקודם.' },
  { target: '.f-chart',     title: 'הכנסה מצטברת',    body: 'הקו מצטבר את ההכנסות יום אחר יום מול יעד ההכנסה החודשי (הקו המקווקו). ככה רואים אם אתם בקצב.' },
  { target: '.f-breakdown', title: 'מאיפה ולאן',       body: 'פירוק של ההכנסות לפי פרויקט וההוצאות לפי קטגוריה — תמונה ברורה של מאיפה הכסף מגיע ולאן הוא הולך.' },
  { target: '.rec-section', title: 'תבניות חוזרות',    body: 'תנועות שחוזרות כל חודש או שבוע (שכר דירה, מנוי, תשלום קבוע מלקוח). מגדירים פעם אחת, והמערכת יוצרת אותן לבד כתנועה שממתינה לאישור.' },
  { target: '.f-list',    title: 'התנועות',          body: 'כל התנועות של החודש. כאלה שממתינות לאישור או שדילגת עליהן מסומנות בנפרד.' },
  { target: '.cta-add',   title: 'תנועה חדשה',       body: 'כאן מוסיפים הכנסה או הוצאה.', radius: '50%', accent: 'sage' },
]

const CALENDAR_TOUR = [
  { target: '.cal-view-toggle', title: 'תצוגות היומן', body: 'ארבע דרכים לראות את הזמן: לוח (רשימה של הקרובים), יום, שבוע או חודש.' },
  { target: '.cta-add',         title: 'אירוע חדש',     body: 'כאן מוסיפים פגישה, תזכורת, משימה או תנועה — הכל ממקום אחד.', radius: '50%', accent: 'sage' },
]

export const TOURS = {
  home:     HOME_TOUR,
  clients:  CLIENTS_TOUR,
  tasks:    TASKS_TOUR,
  leads:    LEADS_TOUR,
  projects: PROJECTS_TOUR,
  goals:    GOALS_TOUR,
  finance:  FINANCE_TOUR,
  calendar: CALENDAR_TOUR,
}

export function tourFor(screenKey) {
  return TOURS[screenKey] || null
}
