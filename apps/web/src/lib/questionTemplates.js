/* ════════════════════════════════════════════════════════════════
   DAILY QUESTION TEMPLATES — one-tap question presets.
   ════════════════════════════════════════════════════════════════
   No questions are seeded; a new user starts empty and adds questions
   (template or custom). qtext() resolves a template_key to its display
   text via i18n (namespace 'questions'), so it follows the active language.
   ════════════════════════════════════════════════════════════════ */

/* Must cover EVERY template_key any creation path uses — the in-app
   AddQuestionModal (mood/energy/sleep/focus) AND the onboarding Step 5
   presets (sleep/nutrition/movement/mood/focus/quiet). A key missing here
   makes questionText() fall back to the generic fallback string. */
import i18n from '@simplicity/core/i18n'

/* Display text lives in i18n (questions:template.<key>). A few templates
   carry a gender-addressed adjective (e.g. focus) and resolve via i18next
   `context` (male/female), falling back to the neutral base key. The list
   below is the set of known template keys; gender resolution is automatic. */
const TEMPLATE_KEYS = ['mood', 'energy', 'sleep', 'focus', 'nutrition', 'movement', 'quiet']

/* Resolve a template_key to display text for the user's form of address.
   Unknown keys return undefined (so questionText falls back). gender omitted
   → neutral base key, so legacy callers are unchanged. */
export const qtext = (key, gender) => {
  if (!TEMPLATE_KEYS.includes(key)) return undefined
  const context = gender === 'male' || gender === 'female' ? gender : undefined
  return i18n.t(`questions:template.${key}`, context ? { context } : undefined)
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
export const questionText = (q, gender) => q.custom_text || qtext(q.template_key, gender) || i18n.t('questions:fallback')

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

/* Human-readable summary of a schedule_pattern for chip labels.
   All user-facing text resolves via i18n (questions:schedule.*). */
export function describeSchedule(question) {
  const p = question?.schedule_pattern
  if (!p) return i18n.t('questions:schedule.everyDay')
  if (p.type === 'days_of_week') {
    const arr = Array.isArray(p.values) ? p.values : []
    if (!arr.length || arr.length === 7) return i18n.t('questions:schedule.everyDay')
    return arr.slice().sort().map((d) => i18n.t(`questions:schedule.dayShort.${d}`)).join(i18n.t('questions:schedule.daySeparator'))
  }
  if (p.type === 'every_x_days') {
    const x = Number(p.x) || 1
    if (x <= 1) return i18n.t('questions:schedule.everyDay')
    return i18n.t('questions:schedule.everyXDays', { count: x })
  }
  return i18n.t('questions:schedule.everyDay')
}
