/* ════════════════════════════════════════════════════════════════
   PROFILE HEALTH — "ציון בריאות פרופיל"
   ════════════════════════════════════════════════════════════════
   A single 0–100 score summarising how fully the user is using the
   system: which major features are activated, whether the profile is
   filled, and a few quality signals (clients missing a price, daily
   questions answered this week).

   Pure logic — no React, no network. Fed the already-loaded rows from
   the existing hooks (see useProfileHealth). Every list is filtered to
   live records (deleted_at IS NULL) here, so callers may pass raw
   hook output.

   The score is the share of APPLICABLE checks that pass. A check can be
   "not applicable" (e.g. "answered daily questions" only matters once
   the user actually has questions) — those drop out of the denominator
   so we never double-punish a feature that isn't set up yet.
   ════════════════════════════════════════════════════════════════ */
import { ROUTES } from './routes'

/* Tier thresholds — colour + key by score. Low stays on the soft
   warning amber rather than danger clay until it's really sparse, so a
   fresh account reads as "opportunity", not "failure". */
export const HEALTH_TIERS = [
  { key: 'low',  min: 0,  color: 'var(--clay)' },
  { key: 'mid',  min: 40, color: 'var(--amber-warn)' },
  { key: 'high', min: 75, color: 'var(--sage)' },
]

export function healthTier(score) {
  let tier = HEALTH_TIERS[0]
  for (const t of HEALTH_TIERS) if (score >= t.min) tier = t
  return tier
}

/* Live rows only (drop soft-deleted). */
const live = (arr) => (Array.isArray(arr) ? arr.filter((r) => r && !r.deleted_at) : [])

/* A client counts as "missing a price" when there's no per-session
   price, no whole-package override, and no explicit custom-price flag —
   i.e. nothing tells us what this client is worth. */
const missingPrice = (c) =>
  !(Number(c.price_per_session) > 0) && c.total_override == null && !c.has_custom_price

/* Profile role is "set" when it's a real role, or 'other' with a
   free-text specialisation typed in. */
function roleFilled(profile) {
  const role = profile?.role
  if (!role) return false
  if (role === 'other') return !!profile?.role_other?.trim()
  return true
}

/* Local YYYY-MM-DD (avoids new Date('YYYY-MM-DD') parsing as UTC, which
   shifts the day in +02/03 timezones). */
function ymd(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/* Was there any daily answer in the last 7 days (today + 6 prior)?
   daily_answers.date is a DATE ('YYYY-MM-DD'), so a lexical string
   compare is correct and timezone-proof. */
function answeredThisWeek(answers, today) {
  const cutoff = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6))
  return live(answers).some((a) => a.date && String(a.date).slice(0, 10) >= cutoff)
}

/* ── The check registry ───────────────────────────────────────────
   Order here = the order gaps are surfaced in the breakdown. Quick
   profile wins + quality nudges first, then feature activation. */
export function computeProfileHealth(data = {}, today = new Date()) {
  const profile = data.profile || {}
  const clients = live(data.clients)
  const transactions = live(data.transactions)
  const recurring = live(data.recurring).filter((r) => r.active !== false)
  const projects = live(data.projects)
  const tasks = live(data.tasks)
  const reminders = live(data.reminders)
  const leads = live(data.leads)
  const goals = live(data.goals)
  const questions = live(data.questions).filter((q) => q.active !== false)
  const answers = data.answers

  const unpriced = clients.filter(missingPrice).length

  const SETTINGS_PROFILE = { route: ROUTES.SETTINGS, state: { openSection: 'profile' } }

  /* Each check: { id, group, icon, label (gap text), action, applicable, passed }
     group ∈ 'profile' | 'quality' | 'activation' — used only for styling. */
  const checks = [
    {
      id: 'profile_name', group: 'profile', icon: 'user',
      label: 'השלמת השם שלך',
      action: { label: 'השלמה', ...SETTINGS_PROFILE },
      applicable: true, passed: !!profile?.full_name?.trim(),
    },
    {
      id: 'profile_role', group: 'profile', icon: 'user',
      label: 'בחירת תפקיד והתמחות',
      action: { label: 'בחירה', ...SETTINGS_PROFILE },
      applicable: true, passed: roleFilled(profile),
    },
    {
      id: 'clients_priced', group: 'quality', icon: 'wallet',
      label: unpriced === 1 ? 'חסר מחיר ללקוח אחד' : `חסר מחיר ל-${unpriced} לקוחות`,
      action: { label: 'תמחור', route: ROUTES.CLIENTS },
      applicable: clients.length > 0, passed: unpriced === 0, count: unpriced,
    },
    {
      id: 'answers_recent', group: 'quality', icon: 'sparkles',
      label: 'לא ענית על השאלות היומיות השבוע',
      action: { label: 'מענה', route: ROUTES.INSIGHTS },
      applicable: questions.length > 0, passed: answeredThisWeek(answers, today),
    },
    {
      id: 'clients_exist', group: 'activation', icon: 'users',
      label: 'עדיין לא הוספת לקוחות',
      action: { label: 'הוספה', route: ROUTES.CLIENTS },
      applicable: true, passed: clients.length > 0,
    },
    {
      id: 'transactions_exist', group: 'activation', icon: 'wallet',
      label: 'טרם רשמת תנועות כספיות',
      action: { label: 'רישום', route: ROUTES.FINANCE },
      applicable: true, passed: transactions.length > 0,
    },
    {
      id: 'recurring_exist', group: 'activation', icon: 'repeat',
      label: 'טרם הגדרת הוצאה חוזרת בכסף',
      action: { label: 'הגדרה', route: ROUTES.FINANCE },
      applicable: true, passed: recurring.length > 0,
    },
    {
      id: 'projects_exist', group: 'activation', icon: 'folder',
      label: 'טרם יצרת פרויקט',
      action: { label: 'יצירה', route: ROUTES.PROJECTS },
      applicable: true, passed: projects.length > 0,
    },
    {
      id: 'tasks_exist', group: 'activation', icon: 'tasks',
      label: 'אין לך משימות פתוחות',
      action: { label: 'הוספה', route: ROUTES.TASKS },
      applicable: true, passed: tasks.length > 0,
    },
    {
      id: 'reminders_exist', group: 'activation', icon: 'bell',
      label: 'לא הגדרת תזכורות',
      action: { label: 'הגדרה', route: ROUTES.TASKS },
      applicable: true, passed: reminders.length > 0,
    },
    {
      id: 'goals_exist', group: 'activation', icon: 'target',
      label: 'לא הגדרת יעדים',
      action: { label: 'הגדרה', route: ROUTES.GOALS },
      applicable: true, passed: goals.length > 0,
    },
    {
      id: 'questions_exist', group: 'activation', icon: 'sparkles',
      label: 'אין לך שאלות יומיות',
      action: { label: 'הוספה', route: ROUTES.INSIGHTS },
      applicable: true, passed: questions.length > 0,
    },
    {
      id: 'leads_exist', group: 'activation', icon: 'leads',
      label: 'טרם רשמת לידים',
      action: { label: 'הוספה', route: ROUTES.LEADS },
      applicable: true, passed: leads.length > 0,
    },
  ]

  const applicable = checks.filter((c) => c.applicable)
  const passed = applicable.filter((c) => c.passed)
  const score = applicable.length === 0 ? 100 : Math.round((passed.length / applicable.length) * 100)
  const gaps = applicable.filter((c) => !c.passed)

  return {
    score,
    tier: healthTier(score),
    total: applicable.length,
    passedCount: passed.length,
    checks,
    gaps,
  }
}
