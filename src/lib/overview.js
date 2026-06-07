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
   A flat NON-zero series sits at 50 ("no movement"); a flat ALL-ZERO
   series sits at 0 — otherwise an income/leads line for a user with no
   activity would draw at mid-height and read as "steady medium income". */
function normalize(raw) {
  const vals = raw.filter((v) => v != null)
  if (!vals.length) return raw.map(() => null)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  if (max === min) return raw.map((v) => (v == null ? null : (max === 0 ? 0 : 50)))
  return raw.map((v) => (v == null ? null : ((v - min) / (max - min)) * 100))
}

/* ════════════════════════════════════════════════════════════════
   CORRELATIONS (§8.2) — guarded "patterns to explore". The whole point
   is to NOT mislead: Spearman (rank, outlier-robust) + a permutation
   significance gate + a split-half stability gate + a hard cap on how
   many we surface, and we never headline the single strongest. The
   common, correct outcome is "no significant link — and that's fine".
   ════════════════════════════════════════════════════════════════ */

/* Average ranks (ties shared) — the basis for Spearman. */
function rankArray(arr) {
  const order = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0])
  const ranks = new Array(arr.length)
  let i = 0
  while (i < order.length) {
    let j = i
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k += 1) ranks[order[k][1]] = avg
    i = j + 1
  }
  return ranks
}

function pearson(x, y) {
  const n = x.length
  if (n < 3) return 0
  const mx = x.reduce((a, b) => a + b, 0) / n
  const my = y.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i += 1) {
    const dx = x[i] - mx
    const dy = y[i] - my
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy
  }
  if (sxx === 0 || syy === 0) return 0
  return sxy / Math.sqrt(sxx * syy)
}

function spearman(x, y) {
  return pearson(rankArray(x), rankArray(y))
}

/* Deterministic PRNG (mulberry32) so the permutation p-value is stable
   across renders — no flicker for a link sitting near the threshold. */
function makeRng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* Stable 32-bit string hash → permutation seed keyed to the link's
   IDENTITY (driver|outcome), not its position in the candidate array.
   Reordering / toggling questions no longer reshuffles every p-value. */
function strHash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/* Permutation test: how often a shuffled outcome matches/beats the
   observed |ρ|. The (ge+1)/(iters+1) estimator never returns 0, so a
   real link stays distinguishable under multiple-comparison correction. */
function permutationP(x, y, rhoObs, iters, seed) {
  const rng = makeRng(seed)
  const yc = y.slice()
  const absObs = Math.abs(rhoObs)
  let ge = 0
  for (let it = 0; it < iters; it += 1) {
    for (let i = yc.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      const tmp = yc[i]; yc[i] = yc[j]; yc[j] = tmp
    }
    if (Math.abs(spearman(x, yc)) >= absObs) ge += 1
  }
  return (ge + 1) / (iters + 1)
}

/* Same-sign, non-trivial Spearman in BOTH chronological halves → the
   pattern is stable, not driven by one stretch. Each half needs ≥5 points
   and |r| ≥ 0.2 (4-point halves clear a 0.1 bar almost by chance). */
function splitHalfStable(xs, ys) {
  const n = xs.length
  const mid = Math.floor(n / 2)
  if (mid < 5 || n - mid < 5) return false
  const r1 = spearman(xs.slice(0, mid), ys.slice(0, mid))
  const r2 = spearman(xs.slice(mid), ys.slice(mid))
  return Math.sign(r1) === Math.sign(r2) && Math.abs(r1) >= 0.2 && Math.abs(r2) >= 0.2
}

function strengthLabel(absR) {
  if (absR >= 0.5) return 'חזק'
  if (absR >= 0.35) return 'בינוני'
  return 'עדין'
}

/* One window's day keys + per-day raw arrays for the count outcomes. */
function corrContext(ctx, window, now) {
  const days = windowDays(window, now)
  return {
    days,
    income:   rawSeries('income',   days, ctx),
    leads:    rawSeries('leads',    days, ctx),
    sessions: rawSeries('sessions', days, ctx),
  }
}

/* Per-day value map for one question (dayKey → value_num). */
function questionDayMap(answers, qid) {
  const m = Object.create(null)
  ;(answers || []).forEach((a) => {
    if (a.deleted_at || a.user_question_id !== qid || a.value_num == null) return
    m[dayKey(a.date)] = Number(a.value_num)
  })
  return m
}

/* Build paired observations for a (driver question, outcome) candidate.
   Q↔Q pairs are DAILY (same self-report cadence); a count outcome is
   aggregated WEEKLY (7-day blocks: mean driver vs summed outcome) to
   damp daily noise and the worst of the reporting lag. */
function buildPairs(driverMap, outcome, corr) {
  const { days } = corr
  const xs = []
  const ys = []
  if (outcome.kind === 'question') {
    days.forEach((k) => {
      const d = driverMap[k]
      const o = outcome.map[k]
      if (d != null && o != null) { xs.push(d); ys.push(o) }
    })
  } else {
    const arr = corr[outcome.kind] /* aligned to days */
    /* Full 7-day blocks only — a trailing partial week sums fewer days and
       would bias its outcome low against the full weeks. */
    for (let i = 0; i + 7 <= days.length; i += 7) {
      let dSum = 0; let dCount = 0; let oSum = 0
      for (let j = i; j < i + 7; j += 1) {
        const d = driverMap[days[j]]
        if (d != null) { dSum += d; dCount += 1 }
        oSum += arr[j] || 0
      }
      /* Need ≥3 answered days for a stable weekly driver mean — a week
         with one stray answer is noise, not a data point. */
      if (dCount >= 3) { xs.push(dSum / dCount); ys.push(oSum) }
    }
  }
  return { xs, ys }
}

const OUTCOME_LABELS = { income: 'הכנסות', leads: 'פניות', sessions: 'פגישות' }

/* The guarded pipeline (analytics §8.2). Cheap gates (sample size, a
   minimum |ρ|, split-half stability) pre-filter; survivors get a permutation
   p-value; then a Benjamini-Hochberg FDR correction over the FULL candidate
   family controls the false-discovery rate from testing many pairs. Returns
   ≤ `cap` survivors as a flat "patterns to explore" list — never a headline.
   The common, correct result is an empty array. */
export function buildOverviewCorrelations(ctx, {
  window = 120, now = new Date(), questions = [],
  minDaily = 14, minWeekly = 10, fdrQ = 0.10, iters = 2000, cap = 3,
} = {}) {
  const corr = corrContext(ctx, window, now)
  /* Only numeric (1–10) questions drive a correlation — "when X is higher"
     is meaningless for a yes/no question, and the wording would read wrong. */
  const active = (questions || []).filter((q) => q.active && q.scale_type !== 'yes_no')
  const maps = active.map((q) => ({ q, map: questionDayMap(ctx.answers, q.id) }))

  const candidates = []
  maps.forEach(({ q: dq, map: dMap }, di) => {
    /* Q ↔ other Q (each unordered pair once). */
    maps.forEach(({ q: oq, map: oMap }, oi) => {
      if (oi <= di) return
      candidates.push({ driver: dq, driverMap: dMap, outcomeKey: `q:${oq.id}`, outcomeLabel: null, outcomeQ: oq, outcome: { kind: 'question', map: oMap }, minN: minDaily })
    })
    /* Q ↔ count outcomes (weekly). */
    ;['income', 'leads', 'sessions'].forEach((key) => {
      candidates.push({ driver: dq, driverMap: dMap, outcomeKey: key, outcomeLabel: OUTCOME_LABELS[key], outcomeQ: null, outcome: { kind: key }, minN: minWeekly })
    })
  })

  /* mTotal = the whole family of comparisons, so the FDR denominator
     reflects every test we COULD have surfaced — the multiple-comparison
     guard the per-test p-value alone can't provide. */
  const mTotal = candidates.length
  if (mTotal === 0) return []

  const scored = []
  candidates.forEach((c) => {
    const { xs, ys } = buildPairs(c.driverMap, c.outcome, corr)
    if (xs.length < c.minN) return
    const rho = spearman(xs, ys)
    if (Math.abs(rho) < 0.2) return
    if (!splitHalfStable(xs, ys)) return
    const key = `${c.driver.id}|${c.outcomeKey}`
    const p = permutationP(xs, ys, rho, iters, strHash(key))
    scored.push({
      p,
      result: {
        key,
        driverLabel: c.driver,            /* caller resolves text */
        outcomeLabel: c.outcomeLabel,     /* null for question → caller resolves */
        outcomeQ: c.outcomeQ,
        rho,
        p,
        n: xs.length,
        direction: rho >= 0 ? 'pos' : 'neg',
        strength: strengthLabel(Math.abs(rho)),
        points: xs.map((x, i) => ({ x, y: ys[i] })),
      },
    })
  })

  /* Benjamini-Hochberg: sort by p, keep the largest prefix where
     p(k) ≤ (k / mTotal) · q. Survivors have a controlled false-discovery
     rate even though many pairs were tested. */
  scored.sort((a, b) => a.p - b.p)
  let kMax = 0
  for (let k = 1; k <= scored.length; k += 1) {
    if (scored[k - 1].p <= (k / mTotal) * fdrQ) kMax = k
  }
  return scored
    .slice(0, kMax)
    .map((s) => s.result)
    .sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho))
    .slice(0, cap)
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
      /* Legend value: count/money metrics show the WINDOW TOTAL (a daily
         "latest" is almost always 0 and would mislead); the score and a
         daily question show their latest answered value. */
      const lastRaw = [...raw].reverse().find((v) => v != null)
      const summary = m.missingZero
        ? raw.reduce((acc, v) => acc + (v || 0), 0)
        : (lastRaw == null ? null : lastRaw)
      return {
        key: m.key,
        label: m.key === 'question' && questionLabel ? questionLabel : m.label,
        color: m.color,
        unit: m.unit,
        raw,
        norm: normalize(raw),
        summary,
        summaryKind: m.missingZero ? 'total' : 'latest',
      }
    })
  return { days, series }
}
