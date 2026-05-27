import { useMemo } from 'react'
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
import { useMoonSnapshots } from '../../hooks/useMoonSnapshots'
import './MoonGlanceScreen.css'

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
  const data = useMemo(
    () => ({ goals, categories, entries, transactions, clients, leads, answers }),
    [goals, categories, entries, transactions, clients, leads, answers],
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

      <button type="button" className="mg-footer-link" onClick={() => navigate(ROUTES.GOALS)}>
        ערכ/י את היעדים שלך ←
      </button>
    </div>
  )
}
