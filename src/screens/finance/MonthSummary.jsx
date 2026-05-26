import { ChevronRight, ChevronLeft, ArrowUp, ArrowDown } from 'lucide-react'
import { fmtMonthYear } from '../../lib/dates'
import { isr } from '../../lib/finance'

/* Month header: prev/next nav + net (confirmed only) + income/expense cards.
   RTL — "previous" sits on the right, "next" on the left. */
export default function MonthSummary({ month, onPrev, onNext, income, expenses, net }) {
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

      <p className="f-net-lbl">נטו החודש</p>
      <p className={`f-net mono ${net < 0 ? 'neg' : 'pos'}`}>
        {net < 0 ? '−' : ''}{isr(Math.abs(net))}
      </p>

      <div className="f-hero-divider" />

      <div className="f-io">
        <div className="f-io-card">
          <span className="f-io-icon inc"><ArrowUp size={14} strokeWidth={2} aria-hidden="true" /></span>
          <div>
            <p className="f-io-lbl">הכנסות</p>
            <p className="f-io-v mono">{isr(income)}</p>
          </div>
        </div>
        <div className="f-io-card">
          <span className="f-io-icon exp"><ArrowDown size={14} strokeWidth={2} aria-hidden="true" /></span>
          <div>
            <p className="f-io-lbl">הוצאות</p>
            <p className="f-io-v mono">{isr(expenses)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
