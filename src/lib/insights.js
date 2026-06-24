/* ════════════════════════════════════════════════════════════════
   INSIGHTS — pure stats over user_questions + daily_answers.
   ════════════════════════════════════════════════════════════════
   Everything here works off the raw rows the hooks already give us.
   No DB calls, no React. The Mångata reflection rules port directly
   from the prototype's scripts/insights.js (streak / today extreme
   / change vs previous week / stability) so the home + screen feel
   consistent.
   ════════════════════════════════════════════════════════════════ */

import i18n from '../i18n'
import heReflections from '../i18n/locales/he/reflections.json'
import enReflections from '../i18n/locales/en/reflections.json'
import esReflections from '../i18n/locales/es/reflections.json'
import { qtext } from './questionTemplates'

/* The 'reflections' namespace lives in these three libs (insights / moon /
   profileHealth), not in i18n/index.js's static registration. Register the
   bundles on import so i18n.t('reflections:…') resolves. addResourceBundle
   deep-merges and is idempotent, so all three libs may register safely. */
if (!i18n.hasResourceBundle('he', 'reflections')) i18n.addResourceBundle('he', 'reflections', heReflections, true, true)
if (!i18n.hasResourceBundle('en', 'reflections')) i18n.addResourceBundle('en', 'reflections', enReflections, true, true)
if (!i18n.hasResourceBundle('es', 'reflections')) i18n.addResourceBundle('es', 'reflections', esReflections, true, true)

const MS_PER_DAY = 86400000

export function dateKey(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const dd = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function valueOfAnswer(a) {
  /* yes_no answers are stored as 0/1 in value_num. value_text is the
     legacy free_text path — treated as null for numeric stats. */
  if (!a) return null
  if (a.value_num != null) return Number(a.value_num)
  return null
}

/* Indexed lookup: question_id → date → answer row. Avoids O(N×M)
   scans inside the per-day loops. */
export function indexAnswers(answers) {
  const idx = new Map()
  for (const a of answers || []) {
    if (a.deleted_at) continue
    let inner = idx.get(a.user_question_id)
    if (!inner) {
      inner = new Map()
      idx.set(a.user_question_id, inner)
    }
    inner.set(a.date, a)
  }
  return idx
}

export function getAnswer(idx, qId, date) {
  return idx.get(qId)?.get(typeof date === 'string' ? date : dateKey(date)) || null
}

/* Average of the question's last N days, ignoring days with no
   answer. Returns null if no answered days in the window. */
export function averageForWindow(idx, qId, daysBack, now = new Date()) {
  const inner = idx.get(qId)
  if (!inner) return null
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (daysBack - 1))
  let sum = 0, n = 0
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(cutoff.getTime() + i * MS_PER_DAY)
    const v = valueOfAnswer(inner.get(dateKey(d)))
    if (v != null) { sum += v; n++ }
  }
  return n ? sum / n : null
}

/* Delta of current N-day window vs the immediately preceding window.
   Returns null when either side has no data; otherwise a Number. */
export function deltaVsPrevWindow(idx, qId, daysBack, now = new Date()) {
  const curr = averageForWindow(idx, qId, daysBack, now)
  const prevAnchor = new Date(now.getTime() - daysBack * MS_PER_DAY)
  const prev = averageForWindow(idx, qId, daysBack, prevAnchor)
  if (curr == null || prev == null) return null
  return Math.round((curr - prev) * 10) / 10
}

/* Consecutive days ending on `today` that have AT LEAST ONE answer
   among the user's active questions. Inactive/soft-deleted questions
   are excluded. */
export function streakDaysAny(questions, idx, now = new Date()) {
  const active = (questions || []).filter((q) => q.active && !q.deleted_at)
  if (!active.length) return 0
  let streak = 0
  for (let i = 0; i < 365; i++) {
    const d = new Date(now.getTime() - i * MS_PER_DAY)
    const key = dateKey(d)
    const any = active.some((q) => valueOfAnswer(idx.get(q.id)?.get(key)) != null)
    if (any) streak++
    else if (i > 0) break
    else break
  }
  return streak
}

/* Daily ordered points for the line chart — last `days` days. Missing
   days are emitted as { date, value: null } so the renderer can
   choose to skip them or interpolate. */
export function trendPoints(idx, qId, days = 30, now = new Date()) {
  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    out.push({ date: d, value: valueOfAnswer(idx.get(qId)?.get(dateKey(d))) })
  }
  return out
}

/* Heatmap grid — 53 weeks × 7 rows. Each cell is { date, value }.
   The first column is the week containing (now - 364 days) so the
   newest column is `today`'s week. */
export function heatmapWeeks(idx, qId, now = new Date(), weeks = 53) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const totalDays = weeks * 7
  /* Align to start-of-week (Sunday). */
  const startCandidate = new Date(today.getTime() - (totalDays - 1) * MS_PER_DAY)
  const dow = startCandidate.getDay()
  const start = new Date(startCandidate.getTime() - dow * MS_PER_DAY)
  const cols = []
  for (let w = 0; w < weeks; w++) {
    const col = []
    for (let r = 0; r < 7; r++) {
      const d = new Date(start.getTime() + (w * 7 + r) * MS_PER_DAY)
      if (d > today) { col.push(null); continue }
      col.push({ date: d, value: valueOfAnswer(idx.get(qId)?.get(dateKey(d))) })
    }
    cols.push(col)
  }
  return cols
}

/* Min/max of the question's answers in the last N days. Used by the
   "today is your best/worst day this week" mirror rule. */
export function extremesForWindow(idx, qId, daysBack, now = new Date()) {
  const inner = idx.get(qId)
  if (!inner) return null
  let min = Infinity, max = -Infinity, n = 0
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const v = valueOfAnswer(inner.get(dateKey(d)))
    if (v == null) continue
    n++
    if (v < min) min = v
    if (v > max) max = v
  }
  return n ? { min, max, n } : null
}

/* Rule-based mirror — short reflection sentences. Ported from the
   prototype's mirror logic (streak / today-extreme / change /
   stability). Returns up to 3 messages. */
export function mirrorReflections(questions, idx, now = new Date(), gender) {
  const out = []
  const active = (questions || []).filter((q) => q.active && !q.deleted_at)

  /* Label for a question — its custom text, else the localized template
     text (gendered to the user's form of address), else the raw key. */
  const qLabel = (q) => q.custom_text || qtext(q.template_key, gender) || q.template_key
  /* Some reflection sentences address the user directly ("את/ה כותב/ת"),
     so they resolve to the gendered variant when a form of address is set. */
  const gctx = gender === 'male' || gender === 'female' ? { context: gender } : undefined

  /* 1. Streak — celebrate consecutive engagement. */
  const streak = streakDaysAny(active, idx, now)
  if (streak >= 3) {
    out.push({ kind: 'streak', text: i18n.t('reflections:mirror.streak', { count: streak, ...gctx }) })
  }

  /* 2. Today extremes — surface the question whose today reading is
     the highest or lowest in the last 7 days. Only when today HAS
     an answer for the question. */
  const todayKey = dateKey(now)
  for (const q of active) {
    if (q.scale_type !== '1-10') continue
    const today = valueOfAnswer(idx.get(q.id)?.get(todayKey))
    if (today == null) continue
    const ex = extremesForWindow(idx, q.id, 7, now)
    if (!ex || ex.n < 3) continue
    if (today >= ex.max && today >= 8) {
      out.push({ kind: 'high', text: i18n.t('reflections:mirror.high', { question: qLabel(q), value: today }) })
      break
    }
    if (today <= ex.min && today <= 4) {
      out.push({ kind: 'low', text: i18n.t('reflections:mirror.low', { question: qLabel(q), value: today }) })
      break
    }
  }

  /* 3. Change vs previous week — for the FIRST active 1-10 question
     with both windows populated. */
  for (const q of active) {
    if (q.scale_type !== '1-10') continue
    const d = deltaVsPrevWindow(idx, q.id, 7, now)
    if (d == null) continue
    if (Math.abs(d) < 0.6) continue
    const key = d > 0 ? 'reflections:mirror.deltaUp' : 'reflections:mirror.deltaDown'
    out.push({ kind: 'delta', text: i18n.t(key, { amount: Math.abs(d).toFixed(1), question: qLabel(q) }) })
    break
  }

  /* 4. Stability — when nothing dramatic happened and the user has
     enough history for it to be meaningful. */
  if (out.length === 0) {
    const hasMonthHistory = active.some((q) => averageForWindow(idx, q.id, 30, now) != null)
    if (hasMonthHistory) {
      out.push({ kind: 'stable', text: i18n.t('reflections:mirror.stable') })
    } else {
      out.push({ kind: 'welcome', text: i18n.t('reflections:mirror.welcome', gctx) })
    }
  }

  return out.slice(0, 3)
}
