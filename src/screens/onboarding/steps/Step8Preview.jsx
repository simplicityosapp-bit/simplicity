import { useMemo } from 'react'
import { TrendingUp, Moon, Target } from 'lucide-react'
import { useTransactions } from '../../../hooks/useTransactions'
import { useGoals } from '../../../hooks/useGoals'
import { isr, financeDailyBuckets } from '../../../lib/finance'

/* Step 8 — read-only preview of what the user will see after onboarding.
   Shows mini versions of the three big home/finance/moon visualisations,
   using whatever data the user already entered. If they entered nothing,
   we render artful "this is where it will live" placeholders. */

const W = 240
const H = 56

function MiniIncomeCurve({ transactions }) {
  const buckets = useMemo(() => {
    const now = new Date()
    return financeDailyBuckets(now.getFullYear(), now.getMonth(), { source: transactions })
  }, [transactions])
  const values = buckets.cumInc
  const n = values.length
  if (n === 0 || values.every((v) => v === 0)) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="ob-mini-svg">
        <path d="M6 46 C 60 46 100 30 140 32 S 200 18 234 14" stroke="var(--clay)" strokeWidth="1.6" fill="none" strokeDasharray="3 4" opacity="0.55" />
      </svg>
    )
  }
  const mx = Math.max(...values, 1)
  const step = (W - 12) / Math.max(1, n - 1)
  let d = ''
  values.forEach((v, i) => {
    const x = 6 + i * step
    const y = 6 + (1 - v / mx) * (H - 18)
    d += (d === '' ? 'M' : ' L') + x.toFixed(1) + ',' + y.toFixed(1)
  })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ob-mini-svg">
      <path d={d} stroke="var(--clay)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function MoonArc({ pct = 0 }) {
  const RADIUS = 22
  const C = 2 * Math.PI * RADIUS
  const dash = C * Math.min(1, Math.max(0, pct))
  return (
    <svg viewBox="0 0 60 60" className="ob-mini-arc" aria-hidden="true">
      <circle cx="30" cy="30" r={RADIUS} stroke="rgba(42,37,32,0.12)" strokeWidth="3.5" fill="none" />
      <circle
        cx="30"
        cy="30"
        r={RADIUS}
        stroke="var(--sage)"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${dash} ${C}`}
        transform="rotate(-90 30 30)"
      />
      <text x="30" y="34" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--espresso)">{Math.round(pct * 100)}%</text>
    </svg>
  )
}

export default function Step8Preview({ ob }) {
  const { transactions } = useTransactions()
  const { goals } = useGoals()
  const incomeCurr = useMemo(() => {
    const now = new Date()
    const buckets = financeDailyBuckets(now.getFullYear(), now.getMonth(), { source: transactions })
    return buckets.cumInc[buckets.cumInc.length - 1] || 0
  }, [transactions])
  const goalCount = goals.length

  /* For the moon score we just show a tiny mock — the real engine
     reads moon_snapshots which only land after Home does its first
     daily roll-up. Better to show a stylised "your score will live here". */

  return (
    <>
      <p className="ob-intro">ככל שתזיני יותר — המערכת תשקף יותר.</p>
      <p className="ob-intro-sub">אלו דוגמאות לתוצרים שייווצרו מהדאטה שלך לאורך הזמן.</p>

      <div className="ob-preview-grid">
        <div className="ob-preview-card">
          <p className="ob-preview-title">
            <TrendingUp size={12} strokeWidth={2} aria-hidden="true" /> הכנסה החודש
          </p>
          <MiniIncomeCurve transactions={transactions} />
          <p style={{ margin: 0, fontFamily: 'var(--mg-font-num)', fontSize: 16, fontWeight: 600 }}>
            {isr(incomeCurr)}
          </p>
        </div>

        <div className="ob-preview-card">
          <p className="ob-preview-title">
            <Moon size={12} strokeWidth={2} aria-hidden="true" /> מבט על
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MoonArc pct={0.32} />
            <p className="ob-empty-hint" style={{ flex: 1 }}>
              הציון המשוקלל שלך לפי כל היעדים והרגלים. גדל ככל שיש יותר תשובות יומיות ועסקאות.
            </p>
          </div>
        </div>

        <div className="ob-preview-card" style={{ gridColumn: '1 / -1' }}>
          <p className="ob-preview-title">
            <Target size={12} strokeWidth={2} aria-hidden="true" /> יעדים פעילים
          </p>
          <p style={{ margin: 0, fontFamily: 'var(--mg-font)', fontSize: 13.5 }}>
            {goalCount > 0
              ? `יש לך ${goalCount} יעדים מוגדרים. הם יופיעו ב"מבט על" ובדוחות.`
              : 'עדיין לא הגדרת יעדים — אפשר להוסיף מההגדרות מאוחר יותר.'}
          </p>
        </div>
      </div>

      <p className="ob-empty-hint" style={{ marginTop: 4 }}>
        המסך הזה לא מצריך מילוי — רק הצצה. ממשיכים?
      </p>

      <div className="ob-cta">
        <button
          type="button"
          className="ob-btn primary"
          onClick={() => ob.advance()}
        >
          הלאה
        </button>
      </div>
    </>
  )
}
