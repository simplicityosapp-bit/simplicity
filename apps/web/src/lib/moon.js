/* ════════════════════════════════════════════════════════════════
   MOON SCORE — ported from moon-glance.js (snake_case mock).
   ════════════════════════════════════════════════════════════════
   Each parent goal is scored: pure = actual/target, paced = actual vs
   expected-by-now (period elapsed). The home "confidence" ring is the
   importance-weighted average of per-goal pace, each capped at 100.
   ════════════════════════════════════════════════════════════════ */

import i18n from '@simplicity/core/i18n'
import heReflections from '../i18n/locales/he/reflections.json'
import enReflections from '../i18n/locales/en/reflections.json'
import esReflections from '../i18n/locales/es/reflections.json'
import frReflections from '../i18n/locales/fr/reflections.json'
import { goals as allGoals, goal_categories, goal_entries, sessions, clients as mockClients, leads as mockLeads, daily_answers as mockAnswers, group_members as mockMembers, groups as mockGroups } from '../data/mock'
import { financeQuery, currentMonthRange } from '@simplicity/core'
import { isConvertedLead } from './leads'

/* 'reflections' namespace is owned by these libs, not i18n/index.js — register
   on import so i18n.t resolves even when moon.js loads without insights.js
   (e.g. the home MoonWidget). Idempotent deep-merge. */
if (!i18n.hasResourceBundle('he', 'reflections')) i18n.addResourceBundle('he', 'reflections', heReflections, true, true)
if (!i18n.hasResourceBundle('en', 'reflections')) i18n.addResourceBundle('en', 'reflections', enReflections, true, true)
if (!i18n.hasResourceBundle('es', 'reflections')) i18n.addResourceBundle('es', 'reflections', esReflections, true, true)
if (!i18n.hasResourceBundle('fr', 'reflections')) i18n.addResourceBundle('fr', 'reflections', frReflections, true, true)

const live = (a) => (a || []).filter((r) => !r.deleted_at)
const isActiveClient = (c) => (c.status_meta || c.status || 'no_status') === 'active'

function goalPeriod(goal, now) {
  if (goal.time_frame === 'monthly') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    }
  }
  if (goal.time_frame === 'weekly') {
    const dow = now.getDay()
    const start = new Date(now)
    start.setDate(now.getDate() - dow)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }
  /* deadline */
  const start = goal.created_at ? new Date(goal.created_at) : new Date(now.getFullYear(), now.getMonth(), 1)
  const end = goal.target_date ? new Date(goal.target_date + 'T23:59:59') : new Date(now.getFullYear() + 10, 0, 1)
  return { start, end }
}

function elapsedFraction(period, now) {
  const total = period.end.getTime() - period.start.getTime()
  if (total <= 0) return 1
  return Math.max(0, Math.min(1, (now.getTime() - period.start.getTime()) / total))
}

const isBinary = (goal) => goal.time_frame === 'deadline' && Number(goal.target_value) === 1

function goalActual(goal, cat, now, entries, transactions, clients, leads, answers, members, groups) {
  const period = goalPeriod(goal, now)
  const to = now < period.end ? now : period.end
  /* Sum of manual progress entries for this goal's category within the
     period. Used for purely-manual goals AND added on top of a
     question-tracked goal's answers — a daily-question goal still shows
     the "הזנה" button, so a manual top-up has to count too rather than
     be silently dropped (beta 06/06/2026). End-of-today is the upper
     bound so an entry logged before noon still counts toward today (the
     sentinel date is normalised to 'YYYY-MM-DDT12:00:00'). */
  const sumManualEntries = () => {
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    return live(entries)
      .filter((e) => {
        if (e.category_id !== goal.category_id) return false
        const d = new Date(e.date + 'T12:00:00')
        return d >= period.start && d <= period.end && d <= todayEnd
      })
      .reduce((s, e) => s + (e.value || 0), 0)
  }
  /* D10 — goal tracked by a daily question: value = SUM of that question's
     numeric answers in the period (unanswered days contribute nothing).
     A 1-10 slider answer of 7 adds 7 toward the target (e.g. "35 study
     hours this week"); a yes/no answer adds 1 per "yes". Manual entries
     logged on the same goal are added on top. */
  if (goal.tracking_method === 'daily_question' && goal.tracked_by_question_id) {
    const answersSum = live(answers)
      .filter((a) => {
        if (a.user_question_id !== goal.tracked_by_question_id || a.value_num == null) return false
        const d = new Date(a.date + 'T12:00:00')
        return d >= period.start && d <= to
      })
      .reduce((s, a) => s + Number(a.value_num), 0)
    return answersSum + sumManualEntries()
  }
  if (cat.measurement_type === 'auto') {
    if (cat.data_source === 'transactions') {
      return financeQuery({ type: 'income', from: period.start, to, projectId: goal.project_id || null, source: transactions })
        .reduce((s, f) => s + f.amount, 0)
    }
    if (cat.data_source === 'clients_active') {
      /* snapshot — current count of active clients (graph_type cumulative) */
      return live(clients).filter(isActiveClient).length
    }
    if (cat.data_source === 'leads_inquiries') {
      return live(leads).filter((l) => {
        if (!l.inquiry_date) return false
        const d = new Date(l.inquiry_date + 'T12:00:00')
        return d >= period.start && d <= to
      }).length
    }
    if (cat.data_source === 'leads_closings') {
      return live(leads).filter((l) => {
        if (!isConvertedLead(l)) return false
        const d = new Date(l.converted_at)
        return d >= period.start && d <= to
      }).length
    }
    if (cat.data_source === 'group_members') {
      /* snapshot — distinct active people in groups (graph_type cumulative),
         optionally scoped to the goal's group or project (goals.group_id /
         goals.project_id — both set by AddGoalModal). */
      const activeMembers = live(members).filter((m) => !m.left_at)
      let inScope = activeMembers
      if (goal.group_id) {
        inScope = activeMembers.filter((m) => m.group_id === goal.group_id)
      } else if (goal.project_id) {
        const projGroupIds = new Set(live(groups).filter((g) => g.project_id === goal.project_id).map((g) => g.id))
        inScope = activeMembers.filter((m) => projGroupIds.has(m.group_id))
      }
      /* Set exposes .size — .length was undefined, which turned the actual
         into NaN→0 so the goal never updated (beta feedback 03/06/2026). */
      return new Set(inScope.map((m) => m.client_id)).size
    }
  }
  /* manual — sum of entries in the period (see sumManualEntries above). */
  return sumManualEntries()
}

function scoreGoal(goal, now, categories, entries, transactions, clients, leads, answers, members, groups) {
  const cat = categories.find((c) => c.id === goal.category_id)
  /* target must be a real positive number — Number() guards against a
     non-numeric string slipping past `<= 0` (e.g. "x" <= 0 is false),
     which would make actual/target NaN and surface "NaN%" on the card
     and in the overall moon score. */
  const target = Number(goal.target_value)
  if (!cat || !Number.isFinite(target) || target <= 0) return null
  const rawActual = goalActual(goal, cat, now, entries, transactions, clients, leads, answers, members, groups)
  const actual = Number.isFinite(Number(rawActual)) ? Number(rawActual) : 0
  const binary = isBinary(goal)
  let pure = binary ? (actual >= 1 ? 100 : 0) : Math.round((actual / target) * 100)
  if (!Number.isFinite(pure)) pure = 0
  const isCumulative = cat.graph_type === 'cumulative'
  /* Daily-question goals now SUM their answers (like manual entries), so
     they pace over the period the same way — no special-casing needed. */
  let paced = pure
  if (!isCumulative && !binary) {
    const frac = elapsedFraction(goalPeriod(goal, now), now)
    if (frac > 0) paced = Math.round((actual / (target * frac)) * 100)
  }
  if (!Number.isFinite(paced)) paced = pure
  return { goal, cat, target, actual, pure, paced }
}

/* `data` lets a screen feed real Supabase rows; omitted → mock (so screens
   not yet migrated keep working). { goals, categories, entries, transactions } */
export function moonGetData(now = new Date(), data) {
  const {
    goals = allGoals,
    categories = goal_categories,
    entries = goal_entries,
    transactions,
    clients = mockClients,
    leads = mockLeads,
    answers = mockAnswers,
    members = mockMembers,
    groups = mockGroups,
  } = data || {}
  const scored = live(goals)
    .filter((g) => !g.parent_goal_id)
    .map((g) => scoreGoal(g, now, categories, entries, transactions, clients, leads, answers, members, groups))
    .filter(Boolean)
  if (!scored.length) return { overall: null, scored: [] }
  let tw = 0, tp = 0, tpc = 0, tc = 0
  scored.forEach((s) => {
    const w = Math.max(1, s.goal.importance || 3)
    tw += w
    tp += s.pure * w
    tpc += s.paced * w
    tc += Math.min(100, s.paced) * w
  })
  return {
    overall: {
      pure: Math.round(tp / tw),
      paced: Math.round(tpc / tw),
      confidence: Math.round(tc / tw),
    },
    scored,
  }
}

export function moonHomeStats(now = new Date(), data) {
  const { transactions, sessions: sess = sessions } = data || {}
  const range = currentMonthRange(now)
  const monthIncome = financeQuery({ type: 'income', ...range, source: transactions }).reduce((s, f) => s + f.amount, 0)
  const sessionsCount = live(sess).filter((s) => {
    const d = new Date(s.date)
    return d >= range.from && d <= range.to
  }).length
  const { scored } = moonGetData(now, data)
  const onTrack = scored.filter((s) => Math.min(100, s.paced) >= 80).length
  return { monthIncome, sessionsCount, onTrack, total: scored.length }
}

export function moonReflection(confidence, gender) {
  /* Address the user in their form of address (some strings carry "את/ה"). */
  const opts = gender === 'male' || gender === 'female' ? { context: gender } : undefined
  if (confidence >= 90) return i18n.t('reflections:moon.excellent', opts)
  if (confidence >= 65) return i18n.t('reflections:moon.good', opts)
  if (confidence >= 40) return i18n.t('reflections:moon.behind', opts)
  return i18n.t('reflections:moon.low', opts)
}

/* Per-category breakdown: importance-weighted, pace-capped confidence + the
   goals that feed it. Categories without scored goals are omitted. */
export function moonGetCategories(now = new Date(), data) {
  const { scored } = moonGetData(now, data)
  const byCat = new Map()
  scored.forEach((s) => {
    if (!byCat.has(s.cat.id)) byCat.set(s.cat.id, { category: s.cat, items: [] })
    byCat.get(s.cat.id).items.push(s)
  })
  return [...byCat.values()].map(({ category, items }) => {
    let tw = 0, tc = 0, tp = 0
    items.forEach((s) => {
      const w = Math.max(1, s.goal.importance || 3)
      tw += w
      tc += Math.min(100, s.paced) * w
      tp += s.pure * w
    })
    return { category, confidence: Math.round(tc / tw), pure: Math.round(tp / tw), goals: items }
  })
}

/* Daily confidence for the last `days` days — computed by scoring "as of" each
   day, so it reflects how income + entries accumulate through the period. */
export function moonTrend(days = 30, now = new Date(), data) {
  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 23, 59, 59)
    const res = moonGetData(d, data)
    out.push({ date: d, score: res.overall ? res.overall.confidence : 0 })
  }
  return out
}
