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
import { qtext } from './questionTemplates'
import '../i18n/reflections' // side-effect: register the 'reflections' namespace

export interface Answer {
  deleted_at?: string | null
  user_question_id: string
  date: string
  value_num?: number | string | null
  value_text?: string | null
}
export interface Question {
  id: string
  active?: boolean
  deleted_at?: string | null
  custom_text?: string
  template_key?: string
  scale_type?: string
}
export type AnswerIndex = Map<string, Map<string, Answer>>

const MS_PER_DAY = 86400000

/* Padded YYYY-MM-DD key — matches the daily_answers.date string format so
   answer lookups line up. (Distinct from calendar.dateKey, which is unpadded
   and used for event bucketing.) */
export function ymdKey(d: Date | string | number = new Date()): string {
  const x = d instanceof Date ? d : new Date(d)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const dd = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function valueOfAnswer(a: Answer | null | undefined): number | null {
  /* yes_no answers are stored as 0/1 in value_num. value_text is the
     legacy free_text path — treated as null for numeric stats. */
  if (!a) return null
  if (a.value_num != null) return Number(a.value_num)
  return null
}

/* Indexed lookup: question_id → date → answer row. Avoids O(N×M)
   scans inside the per-day loops. */
export function indexAnswers(answers: Answer[] | null | undefined): AnswerIndex {
  const idx: AnswerIndex = new Map()
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

export function getAnswer(idx: AnswerIndex, qId: string, date: string | Date | number): Answer | null {
  return idx.get(qId)?.get(typeof date === 'string' ? date : ymdKey(date)) || null
}

/* Average of the question's last N days, ignoring days with no
   answer. Returns null if no answered days in the window. */
export function averageForWindow(idx: AnswerIndex, qId: string, daysBack: number, now: Date = new Date()): number | null {
  const inner = idx.get(qId)
  if (!inner) return null
  let sum = 0, n = 0
  for (let i = 0; i < daysBack; i++) {
    /* Local-midnight per day (DST-safe). A fixed cutoff + i*MS_PER_DAY step
       drifts by a day across Israel's autumn fall-back (a 25h day) — double-
       counting one day and dropping the newest. */
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (daysBack - 1 - i))
    const v = valueOfAnswer(inner.get(ymdKey(d)))
    if (v != null) { sum += v; n++ }
  }
  return n ? sum / n : null
}

/* Delta of current N-day window vs the immediately preceding window.
   Returns null when either side has no data; otherwise a Number. */
export function deltaVsPrevWindow(idx: AnswerIndex, qId: string, daysBack: number, now: Date = new Date()): number | null {
  const curr = averageForWindow(idx, qId, daysBack, now)
  const prevAnchor = new Date(now.getTime() - daysBack * MS_PER_DAY)
  const prev = averageForWindow(idx, qId, daysBack, prevAnchor)
  if (curr == null || prev == null) return null
  return Math.round((curr - prev) * 10) / 10
}

/* Consecutive days ending on `today` that have AT LEAST ONE answer
   among the user's active questions. Inactive/soft-deleted questions
   are excluded. */
export function streakDaysAny(questions: Question[] | null | undefined, idx: AnswerIndex, now: Date = new Date()): number {
  const active = (questions || []).filter((q) => q.active && !q.deleted_at)
  if (!active.length) return 0
  let streak = 0
  for (let i = 0; i < 365; i++) {
    const d = new Date(now.getTime() - i * MS_PER_DAY)
    const key = ymdKey(d)
    const any = active.some((q) => valueOfAnswer(idx.get(q.id)?.get(key)) != null)
    if (any) streak++
    else if (i > 0) break
    else break
  }
  return streak
}

interface TrendPoint { date: Date; value: number | null }

/* Daily ordered points for the line chart — last `days` days. Missing
   days are emitted as { date, value: null } so the renderer can
   choose to skip them or interpolate. */
export function trendPoints(idx: AnswerIndex, qId: string, days = 30, now: Date = new Date()): TrendPoint[] {
  const out: TrendPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    out.push({ date: d, value: valueOfAnswer(idx.get(qId)?.get(ymdKey(d))) })
  }
  return out
}

/* Heatmap grid — 53 weeks × 7 rows. Each cell is { date, value }.
   The first column is the week containing (now - 364 days) so the
   newest column is `today`'s week. */
export function heatmapWeeks(idx: AnswerIndex, qId: string, now: Date = new Date(), weeks = 53): (TrendPoint | null)[][] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const totalDays = weeks * 7
  /* Align to start-of-week (Sunday). */
  /* All day-stepping via local-date construction (DST-safe) — a fixed
     start + n*MS_PER_DAY step shifts the whole grid by a day across the
     autumn fall-back. */
  const startCandidate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (totalDays - 1))
  const start = new Date(startCandidate.getFullYear(), startCandidate.getMonth(), startCandidate.getDate() - startCandidate.getDay())
  const cols: (TrendPoint | null)[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: (TrendPoint | null)[] = []
    for (let r = 0; r < 7; r++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + (w * 7 + r))
      if (d > today) { col.push(null); continue }
      col.push({ date: d, value: valueOfAnswer(idx.get(qId)?.get(ymdKey(d))) })
    }
    cols.push(col)
  }
  return cols
}

/* Min/max of the question's answers in the last N days. Used by the
   "today is your best/worst day this week" mirror rule. */
export function extremesForWindow(idx: AnswerIndex, qId: string, daysBack: number, now: Date = new Date()): { min: number; max: number; n: number } | null {
  const inner = idx.get(qId)
  if (!inner) return null
  let min = Infinity, max = -Infinity, n = 0
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const v = valueOfAnswer(inner.get(ymdKey(d)))
    if (v == null) continue
    n++
    if (v < min) min = v
    if (v > max) max = v
  }
  return n ? { min, max, n } : null
}

interface Reflection { kind: string; text: string }

/* Rule-based mirror — short reflection sentences. Ported from the
   prototype's mirror logic (streak / today-extreme / change /
   stability). Returns up to 3 messages. */
export function mirrorReflections(questions: Question[] | null | undefined, idx: AnswerIndex, now: Date = new Date(), gender?: string): Reflection[] {
  const out: Reflection[] = []
  const active = (questions || []).filter((q) => q.active && !q.deleted_at)

  /* Label for a question — its custom text, else the localized template
     text (gendered to the user's form of address), else the raw key. */
  const qLabel = (q: Question): string => q.custom_text || qtext(q.template_key || '', gender) || q.template_key || ''
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
  const todayKey = ymdKey(now)
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
