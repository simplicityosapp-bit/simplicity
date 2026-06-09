import { addressUser } from './address'

/* ════════════════════════════════════════════════════════════════
   Coachmark registry — first-touch guidance copy.
   ════════════════════════════════════════════════════════════════
   Each entry maps a coachmark id (stored in prefs.coachmarks once the
   user interacts) to its Hebrew guidance text:
     - bubble:  one short line shown next to the glowing button.
     - detail:  a fuller explanation revealed when the empty-state
                reminder is expanded.
   Both address the user directly, so each carries {male,female,neutral}
   forms; coachmarkText(id, gender) resolves them via addressUser (the
   neutral form auto-merges to the dual-gender glyph where it can). A
   button is "virgin" (glows + shows its bubble) while its id is absent
   from prefs.coachmarks; the first interaction marks it seen for good.
   ════════════════════════════════════════════════════════════════ */

const COACHMARKS = {
  'add-client': {
    bubble: {
      male:    'התחל כאן — הוסף את הלקוח הראשון',
      female:  'התחילי כאן — הוסיפי את הלקוח הראשון',
      neutral: 'התחל/י כאן — הוסף/י את הלקוח הראשון',
    },
    detail: {
      male:    'הלקוחות הם הלב של סימפליסיטי. כל פגישה, תשלום ויתרה נקשרים ללקוח שתוסיף כאן.',
      female:  'הלקוחות הם הלב של סימפליסיטי. כל פגישה, תשלום ויתרה נקשרים ללקוח שתוסיפי כאן.',
      neutral: 'הלקוחות הם הלב של סימפליסיטי. כל פגישה, תשלום ויתרה נקשרים ללקוח שתוסיף/י כאן.',
    },
  },
  'add-task': {
    bubble: {
      male: 'צור את המשימה הראשונה', female: 'צרי את המשימה הראשונה', neutral: 'צור/י את המשימה הראשונה',
    },
    detail: {
      male:    'משימות הן מטלות ללא תאריך יעד. למטלה עם מועד — השתמש בתזכורת.',
      female:  'משימות הן מטלות ללא תאריך יעד. למטלה עם מועד — השתמשי בתזכורת.',
      neutral: 'משימות הן מטלות ללא תאריך יעד. למטלה עם מועד — השתמש/י בתזכורת.',
    },
  },
  'add-lead': {
    bubble: {
      male: 'הוסף ליד ראשון', female: 'הוסיפי ליד ראשון', neutral: 'הוסף/י ליד ראשון',
    },
    detail: {
      male:    'לידים הם פניות שעוד לא הפכו ללקוחות. עקוב אחרי הסטטוס שלהם עד הסגירה.',
      female:  'לידים הם פניות שעוד לא הפכו ללקוחות. עקבי אחרי הסטטוס שלהם עד הסגירה.',
      neutral: 'לידים הם פניות שעוד לא הפכו ללקוחות. עקוב/עקבי אחרי הסטטוס שלהם עד הסגירה.',
    },
  },
  'add-project': {
    bubble: {
      male: 'פתח את הפרויקט הראשון', female: 'פתחי את הפרויקט הראשון', neutral: 'פתח/י את הפרויקט הראשון',
    },
    detail: {
      male: 'פרויקטים מקבצים לקוחות ומשימות תחת מטרה משותפת אחת.',
      female: 'פרויקטים מקבצים לקוחות ומשימות תחת מטרה משותפת אחת.',
      neutral: 'פרויקטים מקבצים לקוחות ומשימות תחת מטרה משותפת אחת.',
    },
  },
  'add-goal': {
    bubble: {
      male: 'הגדר יעד ראשון', female: 'הגדירי יעד ראשון', neutral: 'הגדר/י יעד ראשון',
    },
    detail: {
      male:    'יעדים עוזרים לך למדוד התקדמות לאורך זמן בתוך קטגוריות שאתה יוצר.',
      female:  'יעדים עוזרים לך למדוד התקדמות לאורך זמן בתוך קטגוריות שאת יוצרת.',
      neutral: 'יעדים עוזרים לך למדוד התקדמות לאורך זמן בתוך קטגוריות שאת/ה יוצר/ת.',
    },
  },
  'add-transaction': {
    bubble: {
      male: 'תעד תנועה כספית ראשונה', female: 'תעדי תנועה כספית ראשונה', neutral: 'תעד/י תנועה כספית ראשונה',
    },
    detail: {
      male:    'כל הכנסה או הוצאה שתתעד מזינה את התמונה הפיננסית והדוחות שלך.',
      female:  'כל הכנסה או הוצאה שתתעדי מזינה את התמונה הפיננסית והדוחות שלך.',
      neutral: 'כל הכנסה או הוצאה שתתעד/י מזינה את התמונה הפיננסית והדוחות שלך.',
    },
  },
  'add-meeting': {
    bubble: {
      male: 'קבע פגישה ראשונה ביומן', female: 'קבעי פגישה ראשונה ביומן', neutral: 'קבע/י פגישה ראשונה ביומן',
    },
    detail: {
      male: 'פגישות ביומן מסתנכרנות עם הלקוחות שלך ומופיעות בתזכורות בדף הבית.',
      female: 'פגישות ביומן מסתנכרנות עם הלקוחות שלך ומופיעות בתזכורות בדף הבית.',
      neutral: 'פגישות ביומן מסתנכרנות עם הלקוחות שלך ומופיעות בתזכורות בדף הבית.',
    },
  },
}

export function coachmarkText(id, gender) {
  const c = COACHMARKS[id]
  if (!c) return { bubble: '', detail: '' }
  return {
    bubble: addressUser(gender, c.bubble),
    detail: addressUser(gender, c.detail),
  }
}
