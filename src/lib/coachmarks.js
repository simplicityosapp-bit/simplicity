/* ════════════════════════════════════════════════════════════════
   Coachmark registry — first-touch guidance copy.
   ════════════════════════════════════════════════════════════════
   Each entry maps a coachmark id (stored in prefs.coachmarks once the
   user interacts) to its Hebrew guidance text:
     - bubble:  one short line shown next to the glowing button.
     - detail:  a fuller explanation revealed when the empty-state
                reminder is expanded.
   A button is "virgin" (glows + shows its bubble) while its id is
   absent from prefs.coachmarks. The first interaction marks it seen
   and the glow disappears for good — even if no record was created.
   ════════════════════════════════════════════════════════════════ */

export const COACHMARKS = {
  'add-client': {
    bubble: 'התחילו כאן — הוסיפו את הלקוח הראשון',
    detail: 'הלקוחות הם הלב של סימפליסיטי. כל פגישה, תשלום ויתרה נקשרים ללקוח שתוסיפו כאן.',
  },
  'add-task': {
    bubble: 'צרו את המשימה הראשונה',
    detail: 'משימות הן דברים לעשות בלי תאריך יעד. למשימה עם דדליין השתמשו בתזכורת.',
  },
  'add-lead': {
    bubble: 'הוסיפו ליד ראשון',
    detail: 'לידים הם פניות שעוד לא הפכו ללקוחות. עקבו אחרי הסטטוס שלהם עד הסגירה.',
  },
  'add-project': {
    bubble: 'פתחו את הפרויקט הראשון',
    detail: 'פרויקטים מקבצים לקוחות ומשימות תחת מטרה משותפת אחת.',
  },
  'add-goal': {
    bubble: 'הגדירו יעד ראשון',
    detail: 'יעדים עוזרים לכם למדוד התקדמות לאורך זמן בתוך קטגוריות שאתם יוצרים.',
  },
  'add-transaction': {
    bubble: 'תעדו תנועה כספית ראשונה',
    detail: 'כל הכנסה או הוצאה שתתעדו מזינה את התמונה הפיננסית והדוחות שלכם.',
  },
  'add-meeting': {
    bubble: 'קבעו פגישה ראשונה ביומן',
    detail: 'פגישות ביומן מסתנכרנות עם הלקוחות שלכם ומופיעות בתזכורות בדף הבית.',
  },
}

export function coachmarkText(id) {
  return COACHMARKS[id] || { bubble: '', detail: '' }
}
