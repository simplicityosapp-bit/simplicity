import { ChevronRight, ChevronLeft, ArrowUp, ArrowDown, TrendingUp, TrendingDown } from 'lucide-react'
import { fmtMonthYear } from '../../lib/dates'
import { isr } from '../../lib/finance'

/* Compute the formatted month-over-month delta. `goodWhenUp` says
   whether an upward change reads as good (income) or bad (expense).
   Returns { text, tone } where tone is 'pos' (sage) or 'neg' (clay)
   or null when there's no signal to show. */
function deltaInfo(curr, prev, goodWhenUp = true) {
  if (prev == null) return null
  if (prev === 0 && curr === 0) return null
  if (prev === 0) {
    return { text: '+חדש', tone: goodWhenUp ? 'pos' : 'neg', dir: 'up' }
  }
  const diff = curr - prev
  if (diff === 0) return { text: '0%', tone: 'neu', dir: 'flat' }
  const pct = Math.round((diff / Math.abs(prev)) * 100)
  const dir = diff > 0 ? 'up' : 'down'
  const isUp = diff > 0
  const tone = (isUp === goodWhenUp) ? 'pos' : 'neg'
  return { text: `${isUp ? '+' : ''}${pct}%`, tone, dir }
}

function DeltaPill({ delta }) {
  if (!delta) return null
  const Icon = delta.dir === 'up' ? TrendingUp : delta.dir === 'down' ? TrendingDown : null
  return (
    <span className={`f-delta ${delta.tone}`} aria-label={`שינוי ${delta.text}`}>
      {Icon && <Icon size={11} strokeWidth={1.8} aria-hidden="true" />}
      <span className="mono">{delta.text}</span>
    </span>
  )
}

/* Month header: prev/next nav + net (confirmed only) + income/expense cards.
   Delta pills (vs previous month) appear next to each metric when prev-
   month data is available. RTL — "previous" sits on the right, "next" on the left. */
export default function MonthSummary({
  month, onPrev, onNext,
  income, expenses, net,
  prevIncome, prevExpenses, prevNet,
}) {
  const incomeDelta = deltaInfo(income, prevIncome, true)
  const expenseDelta = deltaInfo(expenses, prevExpenses, false)
  const netDelta = deltaInfo(net, prevNet, true)
  return (
    <div className="f-hero">
      <div className="f-month-nav">
        <button type="button" className="f-month-btn" onClick={onPrev} aria-label="חודש קודם">
          <ChevronRight size={18} strokeWidth={1.6} aria-hidden="true" />
        </button>
        <span className="f-month-label">{fmtMonthYear(month)}</span>
        <button type="button" className="f-month-btn" onClick={onNext} aria-label="חודש הבא">
          <ChevronLeft size={18} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>

      <div className="f-net-row">
        <p className="f-net-lbl">נטו החודש</p>
        <DeltaPill delta={netDelta} />
      </div>
      <p className={`f-net mono ${net < 0 ? 'neg' : 'pos'}`}>
        {net < 0 ? '−' : ''}{isr(Math.abs(net))}
      </p>

      <div className="f-hero-divider" />

      <div className="f-io">
        <div className="f-io-card">
          <span className="f-io-icon inc"><ArrowUp size={14} strokeWidth={2} aria-hidden="true" /></span>
          <div>
            <div className="f-io-head">
              <p className="f-io-lbl">הכנסות</p>
              <DeltaPill delta={incomeDelta} />
            </div>
            <p className="f-io-v mono">{isr(income)}</p>
          </div>
        </div>
        <div className="f-io-card">
          <span className="f-io-icon exp"><ArrowDown size={14} strokeWidth={2} aria-hidden="true" /></span>
          <div>
            <div className="f-io-head">
              <p className="f-io-lbl">הוצאות</p>
              <DeltaPill delta={expenseDelta} />
            </div>
            <p className="f-io-v mono">{isr(expenses)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
