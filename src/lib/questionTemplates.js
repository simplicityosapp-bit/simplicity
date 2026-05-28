/* ════════════════════════════════════════════════════════════════
   DAILY QUESTION TEMPLATES — one-tap question presets.
   ════════════════════════════════════════════════════════════════
   No questions are seeded; a new user starts empty and adds questions
   (template or custom). QTEXT resolves a template_key to its display text.
   ════════════════════════════════════════════════════════════════ */

export const QTEXT = {
  mood: 'איך מצב הרוח שלך היום?',
  energy: 'כמה אנרגיה יש לך היום?',
  sleep: 'איך ישנת הלילה?',
  focus: 'כמה ממוקד/ת הרגשת היום?',
}

export const QUESTION_TEMPLATES = [
  { key: 'mood', icon: '🫧', scale_type: '1-10' },
  { key: 'energy', icon: '⚡', scale_type: '1-10' },
  { key: 'sleep', icon: '🌙', scale_type: '1-10' },
  { key: 'focus', icon: '🎯', scale_type: '1-10' },
]

/* The text shown for a question row (custom_text wins, else the template). */
export const questionText = (q) => q.custom_text || QTEXT[q.template_key] || 'שאלת היום'

const MS_PER_DAY = 86400000

/* Whether a question should appear today based on its schedule_pattern.
   Pattern shape (data-model D12):
     {type: 'days_of_week', values: [0..6]}  — only on those weekday(s)
     {type: 'every_x_days', x: N}            — every N days counted from created_at
   Missing/null pattern = always. */
export function isQuestionDueToday(question, today = new Date()) {
  const p = question?.schedule_pattern
  if (!p) return true
  if (p.type === 'days_of_week') {
    const arr = Array.isArray(p.values) ? p.values : []
    if (!arr.length) return true
    return arr.includes(today.getDay())
  }
  if (p.type === 'every_x_days') {
    const x = Number(p.x) || 1
    if (x <= 1) return true
    const created = question.created_at ? new Date(question.created_at) : today
    const c = new Date(created.getFullYear(), created.getMonth(), created.getDate())
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const diffDays = Math.round((t - c) / MS_PER_DAY)
    return diffDays >= 0 && diffDays % x === 0
  }
  return true
}

/* Human-readable summary of a schedule_pattern for chip labels. */
const DAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
export function describeSchedule(question) {
  const p = question?.schedule_pattern
  if (!p) return 'כל יום'
  if (p.type === 'days_of_week') {
    const arr = Array.isArray(p.values) ? p.values : []
    if (!arr.length || arr.length === 7) return 'כל יום'
    return arr.slice().sort().map((d) => DAY_SHORT[d]).join(', ')
  }
  if (p.type === 'every_x_days') {
    const x = Number(p.x) || 1
    if (x <= 1) return 'כל יום'
    return `כל ${x} ימים`
  }
  return 'כל יום'
}
