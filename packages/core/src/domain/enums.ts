/* ════════════════════════════════════════════════════════════════
   ENUMS — Simplicity (ES modules)
   ════════════════════════════════════════════════════════════════
   מבוסס על HTML for MVP/scripts/enums.js, מעודכן לפי data-model.md
   ועל פי הוראות פרומפט ה-scaffold (25.05.26).

   On migration to TypeScript, each array becomes a literal-type union:
     export type ClientStatus = (typeof CLIENT_STATUSES)[number];

   ✅ 25.05.26 — יושר ל-data-model.md בכל הנקודות (data-model מנצח את הפרומפט):
   REMINDER_STATUSES, REMINDER_LINKED_TYPES (+'period'), פיצול RECURRENCE לשני enums
   (REMINDER_RECURRENCE_TYPES + RECURRING_CADENCE_TYPES), TRACKING_METHODS,
   ותווית wandering ('בהפסקה').
   ════════════════════════════════════════════════════════════════ */

/* ── Clients ──────────────────────────────────────────────────── */
export const CLIENT_STATUSES = ['active', 'wandering', 'past', 'no_status'] // D18: נוסף 'no_status'
export const CLIENT_STATUS_META = ['active', 'wandering', 'past', 'no_status']

/* ── Tasks ────────────────────────────────────────────────────── */
export const TASK_STATUSES = ['todo', 'done']
export const TASK_PRIORITIES = ['high', 'medium', 'low']

/* ── Finance ──────────────────────────────────────────────────── */
export const TX_TYPES = ['income', 'expense']
export const TX_STATUSES = ['confirmed', 'pending', 'skipped'] // D4: נוסף 'skipped'

/* ── Scheduled meetings + sessions ────────────────────────────── */
export const MEETING_STATUSES = ['pending', 'confirmed', 'skipped', 'expired']
export const MEETING_SUBJECT_TYPES = ['client', 'group']
export const SESSION_SUBJECT_TYPES = ['client', 'group']

/* ── Leads ────────────────────────────────────────────────────── */
export const LEAD_STATUS_KEYS = ['new', 'in_contact', 'intro_call', 'pending_decision', 'closed'] // legacy (ל-backward-compat)
export const LEAD_STATUS_META = ['in_process', 'converted', 'not_relevant'] // D24: קטגוריות-מטא (רפאים = תת-סטטוס תחת not_relevant)

/* ── Groups ───────────────────────────────────────────────────── */
export const GROUP_STATUSES = ['active', 'in_development', 'ended'] // סטטוס מחזור קבוצה
export const GROUP_BILLING_MODES = ['package', 'per_session', 'none'] // groups.billing_mode (migration 0005)

/* ── Recurrence — שני enums נפרדים לפי data-model.md ───────────── */
export const REMINDER_RECURRENCE_TYPES = ['none', 'weekly', 'monthly_date', 'every_x_days'] // reminders.recurrence_type
export const RECURRING_CADENCE_TYPES = ['monthly_date', 'weekly'] // recurring_templates.cadence_type

/* ── Reminders ────────────────────────────────────────────────── */
export const REMINDER_STATUSES = ['pending', 'triggered', 'completed', 'dismissed', 'snoozed'] // לפי data-model.md
export const REMINDER_LINKED_TYPES = ['client', 'project', 'group', 'task', 'transaction', 'lead', 'period'] // 'period' = תזכורות מערכת; null = תזכורת עצמאית (היעדר ערך, לא במערך)

/* ── Goals ────────────────────────────────────────────────────── */
export const GOAL_TIME_FRAMES = ['monthly', 'weekly', 'deadline']
export const GOAL_MEASUREMENT_TYPES = ['manual', 'auto'] // goals.measurement_type
export const GOAL_GRAPH_TYPES = ['cumulative', 'delta']
export const TRACKING_METHODS = ['manual', 'daily_question'] // goals.tracking_method (לפי data-model.md)

/* ── Daily questions / answers ────────────────────────────────── */
export const QUESTION_SCALE_TYPES = ['1-10', 'yes_no', 'free_text'] // נוסף 'free_text'

/* ── User preferences ─────────────────────────────────────────── */
export const PREF_CURRENCIES = ['ILS', 'USD', 'EUR']
export const PREF_DATE_FORMATS = ['DD/MM/YY', 'MM/DD/YY', 'YYYY-MM-DD']
export const PREF_TIME_FORMATS = ['24h', '12h']
export const PREF_WEEK_STARTS = ['sunday', 'monday']
export const PREF_TEXT_SIZES = ['small', 'normal', 'large']
export const PREF_GENDERS = ['male', 'female', 'neutral']
export const PREF_CALENDAR_DEFAULT_VIEWS = ['schedule', 'day', 'week', 'month']
export const PREF_ROLES = ['therapist', 'coach', 'facilitator', 'teacher', 'instructor', 'other']

/* ── Widgets config ───────────────────────────────────────────── */
export const WIDGET_CARD_STYLES = ['frosted', 'flat']
export const WIDGET_DENSITIES = ['compact', 'comfortable', 'spacious']
export const WIDGET_TEXT_STRENGTHS = ['normal', 'bold']

/* ── Validator ────────────────────────────────────────────────── */
export function isEnumValue(enumArr: unknown, value: unknown): boolean {
  return Array.isArray(enumArr) && enumArr.indexOf(value) >= 0
}
