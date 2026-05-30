import { useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import { useTransactions } from '../../hooks/useTransactions'
import { useClients } from '../../hooks/useClients'
import { financeDailyBuckets, isr } from '../../lib/finance'

/* Slim project-scoped clone of FinanceChart — a cumulative monthly
   income line (this calendar month) for transactions tagged to this
   project, plus transactions for clients of this project (so client-
   side payments still flow into the project view even when the tx
   itself didn't get a project_id). No dashed goal line; users see a
   simple "did the income climb this month" trace. */
const W = 320
const H = 120
const PAD_X = 12
const PAD_TOP = 14
const PAD_BOTTOM = 22

export default function ProjectIncomeChart({ projectId }) {
  const { transactions } = useTransactions()
  const { clients } = useClients()

  const now = useMemo(() => new Date(), [])
  const buckets = useMemo(() => {
    const projClientIds = new Set(clients.filter((c) => c.project_id === projectId).map((c) => c.id))
    /* financeDailyBuckets only accepts a single projectId filter, so
       prefilter our source to "tx tied to project OR tied to a client
       of the project" before passing it in. */
    const scopedTx = transactions.filter(
      (t) => t.project_id === projectId || (t.client_id && projClientIds.has(t.client_id)),
    )
    return financeDailyBuckets(now.getFullYear(), now.getMonth(), { source: scopedTx })
  }, [transactions, clients, projectId, now])

  const { daysInMonth, cumInc } = buckets
  const total = cumInc[cumInc.length - 1] || 0
  const todayIdx = Math.min(now.getDate() - 1, daysInMonth - 1)
  const todayValue = cumInc[todayIdx] || 0

  const mx = Math.max(...cumInc, 0) * 1.08 || 1
  const stepX = (W - PAD_X * 2) / Math.max(1, daysInMonth - 1)
  const yScale = (v) => PAD_TOP + (1 - v / mx) * (H - PAD_TOP - PAD_BOTTOM)

  let path = ''
  cumInc.forEach((v, i) => {
    const x = PAD_X + i * stepX
    const y = yScale(v)
    path += (path === '' ? 'M' : ' L') + x.toFixed(1) + ',' + y.toFixed(1)
  })
  let area = ''
  if (path) {
    const lastX = PAD_X + (cumInc.length - 1) * stepX
    const baseY = H - PAD_BOTTOM
    area = path + ` L${lastX.toFixed(1)},${baseY.toFixed(1)} L${PAD_X.toFixed(1)},${baseY.toFixed(1)} Z`
  }

  const todayX = PAD_X + todayIdx * stepX
  const todayY = yScale(todayValue)
  const labelDays = [...new Set([1, 7, 14, 21, daysInMonth].filter((d) => d >= 1 && d <= daysInMonth))]

  return (
    <section className="pd-chart">
      <div className="pd-chart-head">
        <p className="pd-chart-title">
          <Sparkles size={14} strokeWidth={1.6} aria-hidden="true" />
          הכנסה מצטברת — החודש
        </p>
        <span className="pd-chart-total mono">{isr(total)}</span>
      </div>

      {total === 0 ? (
        <p className="pd-empty pd-chart-empty">אין הכנסות לפרויקט החודש.</p>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="pd-chart-svg"
          style={{ display: 'block', width: '100%', height: `${H}px` }}
          aria-label="גרף הכנסה מצטברת לפרויקט לפי ימי החודש"
        >
          <defs>
            <linearGradient id="pdChartArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="pd-chart-area-top" />
              <stop offset="100%" className="pd-chart-area-bot" />
            </linearGradient>
          </defs>
          {area && <path d={area} fill="url(#pdChartArea)" />}
          {path && <path d={path} className="pd-chart-line" />}
          {path && (
            <circle cx={todayX.toFixed(1)} cy={todayY.toFixed(1)} r="4" className="pd-chart-dot" />
          )}
          {labelDays.map((d) => (
            <text
              key={d}
              x={(PAD_X + (d - 1) * stepX).toFixed(1)}
              y={(H - 6).toFixed(1)}
              textAnchor="middle"
              className="pd-chart-axis"
            >
              {d}
            </text>
          ))}
        </svg>
      )}
    </section>
  )
}
