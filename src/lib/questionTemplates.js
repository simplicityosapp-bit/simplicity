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
