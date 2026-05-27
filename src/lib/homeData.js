/* ════════════════════════════════════════════════════════════════
   HOME DATA — derived values for the home widgets.
   ════════════════════════════════════════════════════════════════
   Each function accepts an optional `data` bag with named members
   (transactions, clients, tasks, leads, sessions, scheduled_meetings,
   goals, categories, reminders). Members default to the mock data so
   screens not yet migrated keep working.
   ════════════════════════════════════════════════════════════════ */

import {
  clients as mockClients, tasks as mockTasks, leads as mockLeads,
  transactions as mockTransactions, reminders as mockReminders,
  scheduled_meetings as mockMeetings, sessions as mockSessions,
  goals as mockGoals, goal_categories as mockCategories,
} from '../data/mock'
import { ROUTES } from './routes'
import { financeQuery, currentMonthRange } from './finance'
import { clientBalance } from './clients'

const DAY = 86400000
const live = (a) => (a || []).filter((r) => !r.deleted_at)
const ils = (n) => `${Math.round(Math.abs(n)).toLocaleString('en-US')} ₪`

/* ── Money ─────────────────────────────────────────────────────── */
export function monthNet(now = new Date(), data) {
  const { transactions } = data || {}
  const tx = financeQuery({ ...currentMonthRange(now), source: transactions })
  const inc = tx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const exp = tx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  return { inc, exp, net: inc - exp }
}
function monthlyIncomeGoal(data) {
  const { goals = mockGoals, categories = mockCategories } = data || {}
  const cat = categories.find((c) => c.measurement_type === 'auto' && c.data_source === 'transactions')
  if (!cat) return 0
  const g = live(goals).find((x) => x.category_id === cat.id && x.time_frame === 'monthly')
  return g ? g.target_value : 0
}

/* ── 45-day rules ──────────────────────────────────────────────── */
function lastClientSession(cid, sessions) {
  const ts = live(sessions).filter((s) => s.client_id === cid).map((s) => new Date(s.date).getTime())
  return ts.length ? Math.max(...ts) : null
}
export function clientsNeedingAttention(days = 45, now = new Date(), data) {
  const { clients = mockClients, sessions = mockSessions } = data || {}
  const cutoff = now.getTime() - days * DAY
  return live(clients).filter((c) => {
    if (!['active', 'wandering'].includes(c.status)) return false
    if (c.created_at && new Date(c.created_at).getTime() > cutoff) return false /* too new to nag */
    const last = lastClientSession(c.id, sessions)
    return last === null || last < cutoff
  })
}
export function leadsNeedingAttention(days = 45, now = new Date(), leads = mockLeads) {
  const cutoff = now.getTime() - days * DAY
  return live(leads).filter(
    (l) => l.status_meta === 'in_process' && l.last_status_changed_at && new Date(l.last_status_changed_at).getTime() < cutoff,
  )
}

/* ── Chips ─────────────────────────────────────────────────────── */
export function homeChips(now = new Date(), data) {
  const { clients = mockClients, tasks = mockTasks, transactions } = data || {}
  const activeClients = live(clients).filter((c) => ['active', 'wandering'].includes(c.status)).length
  const openTasks = live(tasks).filter((t) => t.status !== 'done').length
  const { net } = monthNet(now, { transactions })
  return { activeClients, openTasks, net }
}

/* ── Attention rows ────────────────────────────────────────────── */
export function attentionItems(now = new Date(), data) {
  const {
    transactions = mockTransactions,
    scheduled_meetings = mockMeetings,
    clients = mockClients,
    tasks = mockTasks,
    goals = mockGoals,
    categories = mockCategories,
    sessions = mockSessions,
    leads = mockLeads,
  } = data || {}
  const items = []
  const pending = (transactions || []).filter((t) => !t.deleted_at && t.status === 'pending')
  if (pending.length) items.push({ icon: 'Wallet', text: `${pending.length} תנועות ממתינות לאישור`, to: ROUTES.FINANCE })

  const pastMeetings = (scheduled_meetings || []).filter(
    (m) => m.status === 'pending' && new Date(m.scheduled_at).getTime() <= now.getTime(),
  )
  if (pastMeetings.length) {
    items.push({ icon: 'Calendar', text: `${pastMeetings.length} ${pastMeetings.length === 1 ? 'פגישה ממתינה' : 'פגישות ממתינות'} לאישור`, to: ROUTES.CALENDAR })
  }

  const withBalance = live(clients).filter((c) => c.status !== 'past' && clientBalance(c, transactions, sessions).balance > 0)
  if (withBalance.length) items.push({ icon: 'Wallet', text: `${withBalance.length} לקוח${withBalance.length > 1 ? 'ות' : ''} עם יתרה`, to: ROUTES.CLIENTS })

  const goal = monthlyIncomeGoal({ goals, categories })
  const { inc } = monthNet(now, { transactions })
  if (goal > 0 && inc < goal) {
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate()
    items.push({ icon: 'Target', text: `חסר ${ils(goal - inc)} ליעד — ${daysLeft} ימים`, to: ROUTES.GOALS })
  }

  const urgent = live(tasks).filter((t) => t.status !== 'done' && t.priority === 'high').length
  if (urgent) items.push({ icon: 'AlertCircle', text: `${urgent} משימות דחופות`, to: ROUTES.TASKS })

  const staleClients = clientsNeedingAttention(45, now, { clients, sessions })
  if (staleClients.length) items.push({ icon: 'Clock', text: `${staleClients.length} לקוח${staleClients.length > 1 ? 'ות' : ''} לא יצרו קשר`, to: ROUTES.CLIENTS })

  const staleLeads = leadsNeedingAttention(45, now, leads)
  if (staleLeads.length) items.push({ icon: 'Clock', text: `${staleLeads.length} ליד${staleLeads.length > 1 ? 'ים' : ''} ללא תנועה`, to: ROUTES.LEADS })

  return items
}

/* ── Upcoming reminders (window: today → +60d) ─────────────────── */
function nextWeeklyOccurrence(r, start) {
  const base = new Date(r.scheduled_at)
  const target = r.recurrence_pattern?.dayOfWeek
  if (typeof target !== 'number') return null
  const d = new Date(Math.max(base.getTime(), start.getTime()))
  d.setHours(base.getHours(), base.getMinutes(), 0, 0)
  for (let i = 0; i < 7; i++) {
    if (d.getDay() === target) return new Date(d)
    d.setDate(d.getDate() + 1)
  }
  return null
}
function nextMonthlyDateOccurrence(r, start) {
  const base = new Date(r.scheduled_at)
  const target = r.recurrence_pattern?.dayOfMonth
  if (typeof target !== 'number') return null
  /* Try this month + 2 forward; pick the first ≥ start. */
  for (let m = 0; m < 3; m++) {
    const y = start.getFullYear()
    const mm = start.getMonth() + m
    const daysInMonth = new Date(y, mm + 1, 0).getDate()
    const day = Math.min(target, daysInMonth)
    const d = new Date(y, mm, day, base.getHours(), base.getMinutes(), 0, 0)
    if (d >= start) return d
  }
  return null
}
function nextEveryXDaysOccurrence(r, start) {
  const base = new Date(r.scheduled_at)
  const x = r.recurrence_pattern?.x
  if (!x || x <= 0) return null
  if (base >= start) return base
  const diffDays = Math.ceil((start.getTime() - base.getTime()) / DAY)
  const steps = Math.ceil(diffDays / x)
  const d = new Date(base)
  d.setDate(d.getDate() + steps * x)
  return d
}
function nextReminderOccurrence(r, start) {
  if (r.recurrence_type === 'weekly') return nextWeeklyOccurrence(r, start)
  if (r.recurrence_type === 'monthly_date') return nextMonthlyDateOccurrence(r, start)
  if (r.recurrence_type === 'every_x_days') return nextEveryXDaysOccurrence(r, start)
  return new Date(r.scheduled_at)
}
/* Surface the next occurrence of each pending/triggered reminder in
   the lookahead window. Default window matches the home widget (60
   days / top 5) so existing callers don't change behaviour; the
   calendar passes wider params to cover its grid views. */
export function remindersUpcoming(now = new Date(), remindersData = mockReminders, daysAhead = 60, limit = 5) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead, 23, 59, 59)
  const out = []
  live(remindersData).forEach((r) => {
    if (!['pending', 'triggered'].includes(r.status)) return
    if (r.end_date && new Date(r.end_date) < start) return
    const occ = nextReminderOccurrence(r, start)
    if (occ && occ >= start && occ <= end) out.push({ id: r.id, title: r.title, when: occ })
  })
  out.sort((a, b) => a.when - b.when)
  return limit ? out.slice(0, limit) : out
}

/* ── Next tasks (open, by priority) ────────────────────────────── */
const PORDER = { high: 0, medium: 1, low: 2 }
export function nextTasks(limit = 5, tasks = mockTasks) {
  return live(tasks)
    .filter((t) => t.status !== 'done')
    .slice()
    .sort((a, b) => (PORDER[a.priority] ?? 1) - (PORDER[b.priority] ?? 1))
    .slice(0, limit)
}
export function openTasksCount(tasks = mockTasks) {
  return live(tasks).filter((t) => t.status !== 'done').length
}
