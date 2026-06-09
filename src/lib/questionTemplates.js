/* ════════════════════════════════════════════════════════════════
   DAILY QUESTION TEMPLATES — one-tap question presets.
   ════════════════════════════════════════════════════════════════
   No questions are seeded; a new user starts empty and adds questions
   (template or custom). QTEXT resolves a template_key to its display text.
   ════════════════════════════════════════════════════════════════ */

/* Must cover EVERY template_key any creation path uses — the in-app
   AddQuestionModal (mood/energy/sleep/focus) AND the onboarding Step 5
   presets (sleep/nutrition/movement/mood/focus/quiet). A key missing here
   makes questionText() fall back to the generic "שאלת היום". */
import { addressUser } from './address'

/* Most templates are gender-neutral ("שלך", "לך", "ישנת"…). A few carry
   an adjective addressed to the user and are stored as {male,female,
   neutral} variants — resolve them with qtext(key, gender). */
export const QTEXT = {
  mood: 'איך מצב הרוח שלך היום?',
  energy: 'כמה אנרגיה יש לך היום?',
  sleep: 'איך ישנת אתמול?',
  focus: { male: 'כמה ממוקד הרגשת היום?', female: 'כמה ממוקדת הרגשת היום?', neutral: 'כמה ממוקד/ת הרגשת היום?' },
  nutrition: 'איך אכלת היום?',
  movement: 'כמה תנועה היה לך היום?',
  quiet: 'כמה שקט מצאת היום?',
}

/* Resolve a template_key to display text for the user's form of address.
   Neutral templates return as-is; gendered ones pick via addressUser
   (gender omitted → neutral/slash form, so legacy callers are unchanged). */
export const qtext = (key, gender) => {
  const v = QTEXT[key]
  return v && typeof v === 'object' ? addressUser(gender, v) : v
}

/* Single source of truth for BOTH the in-app AddQuestionModal and the
   onboarding Step-5 presets (they used to drift apart). One icon per key. */
export const QUESTION_TEMPLATES = [
  { key: 'mood', icon: '🤍', scale_type: '1-10' },
  { key: 'energy', icon: '⚡', scale_type: '1-10' },
  { key: 'sleep', icon: '🌙', scale_type: '1-10' },
  { key: 'focus', icon: '🎯', scale_type: '1-10' },
  { key: 'nutrition', icon: '🥗', scale_type: '1-10' },
  { key: 'movement', icon: '🏃', scale_type: '1-10' },
  { key: 'quiet', icon: '🫧', scale_type: '1-10' },
]

/* The text shown for a question row (custom_text wins, else the template). */
export const questionText = (q, gender) => q.custom_text || qtext(q.template_key, gender) || 'שאלת היום'

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
