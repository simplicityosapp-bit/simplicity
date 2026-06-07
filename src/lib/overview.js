/* ════════════════════════════════════════════════════════════════
   OVERVIEW — cross-module trend builder for the מבט-על dashboard.
   See analytics-formulas.md §8.1. Builds per-day series for several
   modules and min-max normalizes each to 0–100 so different units
   (₪ / count / 1–10 / %) can be eyeballed together on one axis.

   Honest by design: each line is scaled to ITSELF (relative shape,
   not absolute value — raw values live in the legend); count metrics
   treat an empty day as a real 0, while a self-reported question's
   missing day is a gap, not a zero.
   ════════════════════════════════════════════════════════════════ */

const pad2 = (n) => String(n).padStart(2, '0')
/* Local calendar-day key — a date-only string is already a day; a full
   timestamp is bucketed by LOCAL parts (toISOString would shift to UTC). */
function dayKey(d) {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10)
  const dt = d instanceof Date ? d : new Date(d)
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
}

/* Concrete hex (NOT var()) — Chromium mis-resolves var() in an SVG stroke
   in dark mode (see reference_svg_stroke_var_dark_bug). These mid-tones
   stay legible on the glass card in both themes. */
export const OVERVIEW_METRICS = {
  income:   { key: 'income',   label: 'הכנסות',      color: '#8BA888', unit: '₪',  missingZero: true },
  leads:    { key: 'leads',    label: 'פניות',       color: '#C97B5E', unit: '',   missingZero: true },
  sessions: { key: 'sessions', label: 'פגישות',      color: '#D4A574', unit: '',   missingZero: true },
  score:    { key: 'score',    label: 'ציון מבט-על', color: '#7a5cb8', unit: '%',  missingZero: false },
  question: { key: 'question', label: 'שאלה יומית',  color: '#B5634E', unit: '',   missingZero: false },
}

/* Last `window` calendar days, oldest-first, as day keys. */
function windowDays(window, now) {
  const out = []
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  for (let i = window - 1; i >= 0; i -= 1) {
    const d = new Date(base)
    d.setDate(base.getDate() - i)
    out.push(dayKey(d))
  }
  return out
}

/* Raw per-day value for one metric across the day-key list. Returns an
   array aligned to `days`; null = missing (drawn as a gap). */
function rawSeries(metricKey, days, ctx) {
  const { transactions = [], leads = [], sessions = [], answers = [], scoreByDay = {}, questionId = null } = ctx
  const zero = () => days.map(() => 0)

  if (metricKey === 'income') {
    const sum = Object.create(null)
    transactions.forEach((t) => {
      if (t.deleted_at || t.type !== 'income') return
      if (t.status && t.status !== 'confirmed') return
      const k = dayKey(t.date)
      sum[k] = (sum[k] || 0) + Number(t.amount || 0)
    })
    return days.map((k) => sum[k] || 0)
  }
  if (metricKey === 'leads') {
    const cnt = Object.create(null)
    leads.forEach((l) => {
      if (l.deleted_at || !l.inquiry_date) return
      const k = dayKey(l.inquiry_date)
      cnt[k] = (cnt[k] || 0) + 1
    })
    return days.map((k) => cnt[k] || 0)
  }
  if (metricKey === 'sessions') {
    const cnt = Object.create(null)
    sessions.forEach((s) => {
      if (s.deleted_at || !s.date) return
      const k = dayKey(s.date)
      cnt[k] = (cnt[k] || 0) + 1
    })
    return days.map((k) => cnt[k] || 0)
  }
  if (metricKey === 'score') {
    /* scoreByDay: { 'YYYY-MM-DD': number }. Missing day → null (gap). */
    return days.map((k) => (k in scoreByDay ? scoreByDay[k] : null))
  }
  if (metricKey === 'question') {
    if (!questionId) return days.map(() => null)
    const byDay = Object.create(null)
    answers.forEach((a) => {
      if (a.deleted_at || a.user_question_id !== questionId || a.value_num == null) return
      byDay[dayKey(a.date)] = Number(a.value_num)
    })
    return days.map((k) => (k in byDay ? byDay[k] : null))
  }
  return zero()
}

/* Min-max normalize a raw series to 0–100, preserving nulls as gaps.
   A flat series (max === min) sits at 50 so it reads as "no movement". */
function normalize(raw) {
  const vals = raw.filter((v) => v != null)
  if (!vals.length) return raw.map(() => null)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  if (max === min) return raw.map((v) => (v == null ? null : 50))
  return raw.map((v) => (v == null ? null : ((v - min) / (max - min)) * 100))
}

/* Build the overlay: one normalized series per selected metric, each with
   its raw array + latest non-null raw value for the legend. `questionLabel`
   overrides the generic "שאלה יומית" label when a question is selected. */
export function buildOverviewTrend(selectedKeys, ctx, { window = 30, now = new Date(), questionLabel } = {}) {
  const days = windowDays(window, now)
  const series = (selectedKeys || [])
    .map((key) => OVERVIEW_METRICS[key])
    .filter(Boolean)
    .map((m) => {
      const raw = rawSeries(m.key, days, ctx)
      const lastRaw = [...raw].reverse().find((v) => v != null)
      return {
        key: m.key,
        label: m.key === 'question' && questionLabel ? questionLabel : m.label,
        color: m.color,
        unit: m.unit,
        raw,
        norm: normalize(raw),
        latest: lastRaw == null ? null : lastRaw,
      }
    })
  return { days, series }
}
