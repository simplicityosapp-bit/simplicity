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
  'add-task': {
    bubble: {
      male: 'צור את המשימה הראשונה', female: 'צרי את המשימה הראשונה', neutral: 'צור/י את המשימה הראשונה',
    },
    detail: {
      male:    'משימות הן ללא תאריך. תזכורות הן כל מה שיש לו תאריך (חד פעמי, או מעגלי וקבוע).',
      female:  'משימות הן ללא תאריך. תזכורות הן כל מה שיש לו תאריך (חד פעמי, או מעגלי וקבוע).',
      neutral: 'משימות הן ללא תאריך. תזכורות הן כל מה שיש לו תאריך (חד פעמי, או מעגלי וקבוע).',
    },
  },
  'add-lead': {
    bubble: {
      male: 'הוסף ליד ראשון', female: 'הוסיפי ליד ראשון', neutral: 'הוסף/י ליד ראשון',
    },
    detail: {
      male:    'לידים הם פניות שעוד לא הפכו ללקוחות.',
      female:  'לידים הם פניות שעוד לא הפכו ללקוחות.',
      neutral: 'לידים הם פניות שעוד לא הפכו ללקוחות.',
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
      male:    'יעדים עוזרים לוודא שאתה מתקדם בקצב ובכיוון שלך.',
      female:  'יעדים עוזרים לוודא שאת מתקדמת בקצב ובכיוון שלך.',
      neutral: 'יעדים עוזרים לוודא שאת/ה מתקדם/ת בקצב ובכיוון שלך.',
    },
  },
  'add-transaction': {
    bubble: {
      male: 'תעד תנועה כספית ראשונה', female: 'תעדי תנועה כספית ראשונה', neutral: 'תעד/י תנועה כספית ראשונה',
    },
    detail: {
      male:    'כל הכנסה או הוצאה שתתעד מזינה את התמונה הפיננסית שלך.',
      female:  'כל הכנסה או הוצאה שתתעדי מזינה את התמונה הפיננסית שלך.',
      neutral: 'כל הכנסה או הוצאה שתתעד/י מזינה את התמונה הפיננסית שלך.',
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
