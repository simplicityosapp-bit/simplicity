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
  { target: '[data-widget-id="moon"]',      title: 'מבט על', body: {
      male:    'הסתכלות מהירה על קצב מימוש היעדים שלך. בלחיצה תוכל לראות כל יעד בנפרד — ולעבור למסך המלא.',
      female:  'הסתכלות מהירה על קצב מימוש היעדים שלך. בלחיצה תוכלי לראות כל יעד בנפרד — ולעבור למסך המלא.',
      neutral: 'הסתכלות מהירה על קצב מימוש היעדים שלך. בלחיצה תוכל/י לראות כל יעד בנפרד — ולעבור למסך המלא.',
    } },
  { target: '[data-widget-id="insights"]',  title: 'שאלות יומיות', body: {
      male:    'אלה השאלות שבחרת, תוכל לראות את התשובות שלך לאורך זמן במסך "מה איתך היום" ולחבר שאלות חדשות ליעדים במסך היעדים.',
      female:  'אלה השאלות שבחרת, תוכלי לראות את התשובות שלך לאורך זמן במסך "מה איתך היום" ולחבר שאלות חדשות ליעדים במסך היעדים.',
      neutral: 'אלה השאלות שבחרת, תוכל/י לראות את התשובות שלך לאורך זמן במסך "מה איתך היום" ולחבר שאלות חדשות ליעדים במסך היעדים.',
    } },
  { target: '[data-widget-id="quick-row"]', title: 'הוספה מהירה',     body: 'הוספה מהירה זה קיצור דרך לכל כפתורי ההוספה (משימות, הכנסות, לידים…). "עדכון יעד" מאפשר לעדכן מהר יעדים שדורשים הזנה ידנית.' },
  { target: '[data-widget-id="attention"]', title: 'דרוש תשומת לב',   body: 'אישור פגישות שהתקיימו, תשלומים שאמורים להתקבל, כפילויות ביומן — ועוד דברים שלא כדאי שייפלו בין הכיסאות.' },
  { target: '[data-widget-id="reminders"]', title: 'תזכורות', body: {
      male:    'משימות שחוזרות על עצמן, או כל דבר שתרצה להזכיר לעצמך אחת לכמה זמן.',
      female:  'משימות שחוזרות על עצמן, או כל דבר שתרצי להזכיר לעצמך אחת לכמה זמן.',
      neutral: 'משימות שחוזרות על עצמן, או כל דבר שתרצה/י להזכיר לעצמך אחת לכמה זמן.',
    } },
  { target: '[data-widget-id="next-tasks"]',title: 'משימות',          body: 'המשימות הדחופות מופיעות כאן.' },
  { target: '[data-widget-id="chips"]',     title: 'כרטיסי מצב',      body: 'תצוגה ממוקדת בהתאמה אישית — לחיצה כאן תפתח תפריט להתאמה.' },
]

/* Per-screen tours. Each ends on the round "+" CTA (radius 50%, sage
   ring) so the single-button coachmark folds into the walkthrough — no
   double glow. Steps whose target is absent are skipped at runtime. */
const CLIENTS_TOUR = [
  { target: '.c-tabs-row',    title: 'סטטוס הלקוחות', body: {
      male:    'פעיל׊׉, ביניים ולשעבר הם שלושת שדות ה"על", ובתוכם תוכל להגדיר כמה סטטוסים שתרצה.',
      female:  'פעיל׊׉, ביניים ולשעבר הם שלושת שדות ה"על", ובתוכם תוכלי להגדיר כמה סטטוסים שתרצי.',
      neutral: 'פעיל׊׉, ביניים ולשעבר הם שלושת שדות ה"על", ובתוכם תוכל׊ להגדיר כמה סטטוסים שתרצה/י.',
    } },
  { target: '.c-groupby',     title: 'קיבוץ', body: {
      male:    'אפשר להסתכל על הלקוחות לפי סטטוס, לפי הפרויקט, לפי יתרה — ממש איך שתרצה.',
      female:  'אפשר להסתכל על הלקוחות לפי סטטוס, לפי הפרויקט, לפי יתרה — ממש איך שתרצי.',
      neutral: 'אפשר להסתכל על הלקוחות לפי סטטוס, לפי הפרויקט, לפי יתרה — ממש איך שתרצה/י.',
    } },
  { target: '.s-hero',        title: 'סיכום מהיר',     body: 'זה סיכום כללי — "חודשי" מראה את המצב החודש, ו"מצטבר" מראה את הכל מההתחלה.' },
  { target: '.c-select-btn',  title: 'בחירה מרובה',    body: 'אפשר לסמן כמה לקוחות יחד כדי לשנות להם סטטוס במקביל, או למחוק בבת אחת.' },
  { target: '.cta-add',       title: 'הוספת לקוח',     body: 'כאן מוסיפים לקוח׌ חדש׌.', radius: '50%', accent: 'sage' },
]

const TASKS_TOUR = [
  { target: '.t-view',   title: 'משימות ותזכורות', body: 'משימות הן ללא תאריך. תזכורות הן כל מה שיש לו תאריך (חד פעמי, או מעגלי וקבוע) — כאן עוברים ביניהם.' },
  { target: '.cta-add',  title: 'הוספה',            body: 'כאן מוסיפים משימה או תזכורת חדשה.', radius: '50%', accent: 'sage' },
]

const LEADS_TOUR = [
  { target: '.l-view-toggle', title: 'לידים וסטטוסים', body: '"לידים" מציג את הלידים בעמודות לפי הסטטוסים שלהם. במסך הסטטוסים אפשר לערוך ולהוסיף את הסטטוסים השונים של הלידים שלך.' },
  { target: '.l-stats',       title: 'תמונת מצב',      body: 'כמה פניות נכנסו החודש, כמה הפכו ללקוחות, ומה אחוז ההמרה שלך.' },
  { target: '.lead-board',    title: 'לוח הלידים',     body: 'אפשר לגרור ליד מעמודה לעמודה כדי לעדכן איפה הוא עומד.' },
  { target: '.cta-add',       title: 'ליד חדש',        body: 'כאן מוסיפים ליד חדש.', radius: '50%', accent: 'sage' },
]

const PROJECTS_TOUR = [
  { target: '.p-hero', title: 'סיכום הפרויקטים', body: 'סיכום כללי — "חודשי" מראה את מה שהחודש, "מצטבר" מההתחלה.' },
  { target: '.p-list', title: 'כרטיסי הפרויקטים', body: 'כל חלונית מרכזת את הקבוצות, הלקוחות, ההכנסות והמשימות ששייכות לאותו הפרויקט.' },
  { target: '.cta-add', title: 'פרויקט חדש',      body: 'כאן פותחים פרויקט חדש.', radius: '50%', accent: 'sage' },
]

const FINANCE_TOUR = [
  { target: '.f-chart',     title: 'הכנסה מצטברת',    body: 'הקו נבנה יום אחר יום מול יעד ההכנסה החודשי (הקו המקווקו). ככה רואים אם הקצב נשמר.' },
  { target: '.f-breakdown', title: 'מאיפה ולאן',       body: 'הכנסות לפי פרויקט וההוצאות לפי קטגוריה — מאיפה הכסף מגיע ולאן הוא הולך.' },
  { target: '.rec-section', title: 'תבניות חוזרות', body: {
      male:    'תנועות שחוזרות כל חודש או שבוע. מגדירים פעם אחת, והמערכת יוצרת אותן לבד — אתה רק תצטרך לאשר.',
      female:  'תנועות שחוזרות כל חודש או שבוע. מגדירים פעם אחת, והמערכת יוצרת אותן לבד — את רק תצטרכי לאשר.',
      neutral: 'תנועות שחוזרות כל חודש או שבוע. מגדירים פעם אחת, והמערכת יוצרת אותן לבד — את/ה רק תצטרך/י לאשר.',
    } },
  { target: '.f-list',    title: 'התנועות',          body: 'כל התנועות שקרו החודש. כאלה שממתינות לאישור מסומנות בנפרד.' },
  { target: '.cta-add',   title: 'תנועה חדשה',       body: 'כאן מוסיפים הכנסה או הוצאה.', radius: '50%', accent: 'sage' },
]

export const TOURS = {
  home:     HOME_TOUR,
  clients:  CLIENTS_TOUR,
  tasks:    TASKS_TOUR,
  leads:    LEADS_TOUR,
  projects: PROJECTS_TOUR,
  finance:  FINANCE_TOUR,
}

export function tourFor(screenKey) {
  return TOURS[screenKey] || null
}
