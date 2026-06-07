import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Moon, BarChart3 } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { moonGetData, moonGetCategories, moonTrend, moonReflection } from '../../lib/moon'
import { useGoals } from '../../hooks/useGoals'
import { useGoalCategories } from '../../hooks/useGoalCategories'
import { useGoalEntries } from '../../hooks/useGoalEntries'
import { useTransactions } from '../../hooks/useTransactions'
import { useClients } from '../../hooks/useClients'
import { useLeads } from '../../hooks/useLeads'
import { useDailyAnswers } from '../../hooks/useDailyAnswers'
import { useGroups } from '../../hooks/useGroups'
import { useGroupMembers } from '../../hooks/useGroupMembers'
import { useMoonSnapshots } from '../../hooks/useMoonSnapshots'
import { useSessions } from '../../hooks/useSessions'
import { useUserQuestions } from '../../hooks/useUserQuestions'
import { questionText } from '../../lib/questionTemplates'
import { buildOverviewTrend, buildOverviewCorrelations, OVERVIEW_METRICS } from '../../lib/overview'
import MultiTrendChart from '../../components/MultiTrendChart'
import './MoonGlanceScreen.css'

/* Tiny scatter for a correlation card — honest display so the user sees
   the spread, not just a number. Points are min-max scaled per axis. */
function Scatter({ points }) {
  const W = 120, H = 78, PAD = 6
  if (!points || points.length < 3) return null
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const xmin = Math.min(...xs), xmax = Math.max(...xs)
  const ymin = Math.min(...ys), ymax = Math.max(...ys)
  const sx = (x) => (xmax === xmin ? W / 2 : PAD + ((x - xmin) / (xmax - xmin)) * (W - 2 * PAD))
  const sy = (y) => (ymax === ymin ? H / 2 : H - PAD - ((y - ymin) / (ymax - ymin)) * (H - 2 * PAD))
  return (
    <svg className="mg-scatter" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {points.map((p, i) => (
        <circle key={i} cx={Math.round(sx(p.x) * 10) / 10} cy={Math.round(sy(p.y) * 10) / 10} r="2.2" className="mg-scatter-dot" />
      ))}
    </svg>
  )
}

function CorrCard({ driverText, outcomeText, c }) {
  const dir = c.direction === 'pos' ? 'גבוה' : 'נמוך'
  return (
    <div className="mg-corr-card">
      <div className="mg-corr-text">
        <p className="mg-corr-line">כש<b>{driverText}</b> גבוה יותר, <b>{outcomeText}</b> נוטה להיות {dir} יותר.</p>
        <p className="mg-corr-sub">קשר {c.strength} · {c.n} נקודות</p>
      </div>
      <Scatter points={c.points} />
    </div>
  )
}

/* Metric toggles for the cross-module trend overlay (§8.1). */
const OVERVIEW_PILLS = [
  { key: 'income',   label: 'הכנסות' },
  { key: 'leads',    label: 'פניות' },
  { key: 'sessions', label: 'פגישות' },
  { key: 'score',    label: 'ציון' },
  { key: 'question', label: 'שאלה יומית' },
]
const dayKeyOf = (d) => {
  const dt = d instanceof Date ? d : new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function TrendChart({ data }) {
  const W = 300
  const H = 84
  const pad = 5
  if (data.length < 2) return null
  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (W - 2 * pad)
    const y = H - pad - (d.score / 100) * (H - 2 * pad)
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10]
  })
  const line = pts.map((p) => p.join(',')).join(' ')
  const area = `${pad},${H - pad} ${line} ${W - pad},${H - pad}`
  return (
    <svg className="mg-trend-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="מגמת הציון ב-30 הימים האחרונים">
      <polygon className="mg-trend-area" points={area} />
      <polyline className="mg-trend-line" points={line} />
    </svg>
  )
}

export default function MoonGlanceScreen() {
  const navigate = useNavigate()
  const { goals } = useGoals()
  const { categories } = useGoalCategories()
  const { entries } = useGoalEntries()
  const { transactions } = useTransactions()
  const { clients } = useClients()
  const { leads } = useLeads()
  const { answers } = useDailyAnswers()
  const { groups } = useGroups()
  const { members } = useGroupMembers()
  const { sessions } = useSessions()
  const { questions } = useUserQuestions()
  const data = useMemo(
    () => ({ goals, categories, entries, transactions, clients, leads, answers, members, groups }),
    [goals, categories, entries, transactions, clients, leads, answers, members, groups],
  )
  const { overall } = useMemo(() => moonGetData(new Date(), data), [data])
  const cats = useMemo(() => moonGetCategories(new Date(), data), [data])
  const liveTrend = useMemo(() => moonTrend(30, new Date(), data), [data])
  const { snapshots } = useMoonSnapshots(30)

  /* Prefer real persisted snapshots once we have enough to draw a
     meaningful line; fall back to the live recompute for users who
     just started (no historical snapshots yet). */
  const trend = useMemo(() => {
    if (snapshots && snapshots.length >= 2) {
      return snapshots.map((s) => ({
        date: new Date(s.date),
        score: Number(s.confidence ?? s.score ?? 0),
      }))
    }
    return liveTrend
  }, [snapshots, liveTrend])

  const scores = trend.map((t) => t.score)
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
  const peak = scores.length ? Math.max(...scores) : 0

  /* ── Cross-module trend overlay (§8.1) ───────────────────────── */
  const activeQuestions = useMemo(() => (questions || []).filter((q) => q.active), [questions])
  const [overviewKeys, setOverviewKeys] = useState(['income', 'score'])
  const [questionId, setQuestionId] = useState('')
  const toggleOverviewKey = (k) => {
    setOverviewKeys((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
    if (k === 'question' && !questionId && activeQuestions.length) setQuestionId(activeQuestions[0].id)
  }
  const scoreByDay = useMemo(() => {
    const m = {}
    trend.forEach((t) => { m[dayKeyOf(t.date)] = t.score })
    return m
  }, [trend])
  const selectedQuestion = activeQuestions.find((q) => q.id === questionId)
  const overview = useMemo(
    () => buildOverviewTrend(overviewKeys, {
      transactions, leads, sessions, answers, scoreByDay, questionId: questionId || null,
    }, { window: 30, questionLabel: selectedQuestion ? questionText(selectedQuestion) : undefined }),
    [overviewKeys, transactions, leads, sessions, answers, scoreByDay, questionId, selectedQuestion],
  )
  /* Guarded correlations (§8.2) — Spearman + permutation + split-half;
     the common result is an honest "no significant link". */
  const correlations = useMemo(
    () => buildOverviewCorrelations({ transactions, leads, sessions, answers }, { window: 90, questions: activeQuestions }),
    [transactions, leads, sessions, answers, activeQuestions],
  )

  if (!overall) {
    return (
      <div className="screen moon-screen">
        <div className="moon-head">
          <div className="moon-head-title"><Moon size={20} strokeWidth={1.5} /> מבט על</div>
        </div>
        <div className="empty">
          <p className="empty-text">עדיין אין יעדים. הגדר/י יעד כדי לראות את הציון.</p>
        </div>
      </div>
    )
  }

  const conf = overall.confidence

  return (
    <div className="screen moon-screen">
      <div className="moon-head">
        <div className="moon-head-title"><Moon size={20} strokeWidth={1.5} aria-hidden="true" /> מבט על</div>
        <button type="button" className="moon-head-link" onClick={() => navigate(ROUTES.REPORTS)}>
          <BarChart3 size={16} strokeWidth={1.6} aria-hidden="true" /> דוחות
        </button>
      </div>

      <div className="mg-hero">
        <div className="mg-ring" style={{ '--ring-pct': `${conf}%` }}>
          <div className="mg-ring-pct mono">{conf}%</div>
          {/* Micro-word naming the big number as pace — mirrors the home
              MoonWidget kicker so the full screen reads the same. */}
          <div className="mg-ring-kicker">מהקצב</div>
          <div className="mg-ring-sub">{overall.pure}% מהיעד</div>
        </div>
        <p className="mg-reflection">{moonReflection(conf)}</p>
      </div>

      <p className="mg-section-h">פירוק לפי קטגוריה</p>
      <div className="mg-cats">
        {cats.map((c) => (
          <div key={c.category.id} className="mg-cat">
            <div className="mg-cat-head">
              <span className="mg-cat-name">
                <span className="mg-cat-dot" style={{ background: c.category.color || 'var(--moon-deep)' }} />
                {c.category.name}
              </span>
              <span className="mg-cat-pct mono">{c.confidence}%</span>
            </div>
            <div className="mg-cat-bar">
              <div
                className="mg-cat-fill"
                style={{ width: `${Math.min(c.confidence, 100)}%`, background: c.category.color || 'var(--moon-deep)' }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="mg-section-h">המגמה לאורך זמן</p>
      <div className="mg-trend">
        <TrendChart data={trend} />
        <div className="mg-trend-stats">
          <div className="mg-trend-stat">
            <p className="mg-trend-stat-v mono">{avg}%</p>
            <p className="mg-trend-stat-l">ממוצע</p>
          </div>
          <div className="mg-trend-stat divided">
            <p className="mg-trend-stat-v mono">{peak}%</p>
            <p className="mg-trend-stat-l">שיא</p>
          </div>
          <div className="mg-trend-stat">
            <p className="mg-trend-stat-v mono">{conf}%</p>
            <p className="mg-trend-stat-l">היום</p>
          </div>
        </div>
      </div>

      <p className="mg-section-h">מגמות בין מודולים</p>
      <div className="mg-overview">
        <div className="mg-ov-pills">
          {OVERVIEW_PILLS.map((m) => {
            const on = overviewKeys.includes(m.key)
            const disabled = m.key === 'question' && activeQuestions.length === 0
            return (
              <button
                key={m.key}
                type="button"
                disabled={disabled}
                className={`mg-ov-pill${on ? ' on' : ''}`}
                onClick={() => toggleOverviewKey(m.key)}
              >
                <span className="mg-ov-dot" style={{ background: OVERVIEW_METRICS[m.key].color }} />
                {m.label}
              </button>
            )
          })}
        </div>
        {overviewKeys.includes('question') && activeQuestions.length > 0 && (
          <select className="mg-ov-select" value={questionId} onChange={(e) => setQuestionId(e.target.value)}>
            {activeQuestions.map((q) => <option key={q.id} value={q.id}>{questionText(q)}</option>)}
          </select>
        )}
        <MultiTrendChart days={overview.days} series={overview.series} />
        <p className="mg-ov-note">מגמות יחסיות · 30 הימים האחרונים — כל קו בקנה-מידה משלו (0–100). קשר ויזואלי אינו סיבתיות.</p>
      </div>

      <p className="mg-section-h">קשרים לבדיקה</p>
      <div className="mg-overview">
        {correlations.length === 0 ? (
          <p className="mg-corr-empty">אין קשר מובהק בנתונים — וזה בסדר. ככל שתצבור עוד ימים עם תשובות יומיות, נציף כאן דפוסים יציבים שכדאי לבדוק.</p>
        ) : (
          <>
            {correlations.map((c) => (
              <CorrCard
                key={c.key}
                c={c}
                driverText={questionText(c.driverLabel)}
                outcomeText={c.outcomeLabel || (c.outcomeQ ? questionText(c.outcomeQ) : '')}
              />
            ))}
            <p className="mg-ov-note">תצפיות ראשוניות בלבד — קשר אינו סיבתיות. הנתונים מאוגדים ומסוננים סטטיסטית לאמינוּת.</p>
          </>
        )}
      </div>

      <button type="button" className="mg-footer-link" onClick={() => navigate(ROUTES.GOALS)}>
        ערכ/י את היעדים שלך ←
      </button>
    </div>
  )
}
