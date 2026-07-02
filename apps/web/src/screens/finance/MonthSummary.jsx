import { ChevronRight, ChevronLeft, ArrowUp, ArrowDown, TrendingUp, TrendingDown } from 'lucide-react'
import { fmtMonthYear, isr } from '@simplicity/core'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn } from '../../components/ui'

/* Compute the formatted month-over-month delta. `goodWhenUp` says
   whether an upward change reads as good (income) or bad (expense).
   Returns { text, tone } where tone is 'pos' (sage) or 'neg' (clay)
   or null when there's no signal to show. */
function deltaInfo(curr, prev, goodWhenUp = true, newLabel = '+new') {
  if (prev == null) return null
  if (prev === 0 && curr === 0) return null
  if (prev === 0) {
    return { text: newLabel, tone: goodWhenUp ? 'pos' : 'neg', dir: 'up' }
  }
  const diff = curr - prev
  if (diff === 0) return { text: '0%', tone: 'neu', dir: 'flat' }
  const pct = Math.round((diff / Math.abs(prev)) * 100)
  const dir = diff > 0 ? 'up' : 'down'
  const isUp = diff > 0
  const tone = (isUp === goodWhenUp) ? 'pos' : 'neg'
  return { text: `${isUp ? '+' : ''}${pct}%`, tone, dir }
}

function DeltaPill({ delta, t }) {
  if (!delta) return null
  const Icon = delta.dir === 'up' ? TrendingUp : delta.dir === 'down' ? TrendingDown : null
  return (
    <Txt className={`f-delta ${delta.tone}`} aria-label={t('summary.changeAria', { value: delta.text })}>
      {Icon && <Icon size={11} strokeWidth={1.8} aria-hidden="true" />}
      <Txt className="mono">{delta.text}</Txt>
    </Txt>
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
  const { t } = useT('finance')
  const newLabel = t('summary.new')
  const incomeDelta = deltaInfo(income, prevIncome, true, newLabel)
  const expenseDelta = deltaInfo(expenses, prevExpenses, false, newLabel)
  const netDelta = deltaInfo(net, prevNet, true, newLabel)
  return (
    <Box className="f-hero">
      <Box className="f-month-nav">
        <Btn type="button" className="f-month-btn" onClick={onPrev} aria-label={t('summary.prevMonth')}>
          <ChevronRight size={18} strokeWidth={1.6} aria-hidden="true" />
        </Btn>
        <Txt className="f-month-label">{fmtMonthYear(month)}</Txt>
        <Btn type="button" className="f-month-btn" onClick={onNext} aria-label={t('summary.nextMonth')}>
          <ChevronLeft size={18} strokeWidth={1.6} aria-hidden="true" />
        </Btn>
      </Box>

      <Box className="f-net-row">
        <Txt as="p" className="f-net-lbl">{t('summary.netThisMonth')}</Txt>
        <DeltaPill delta={netDelta} t={t} />
      </Box>
      <Txt as="p" className={`f-net mono ${net < 0 ? 'neg' : 'pos'}`}>
        {net < 0 ? '−' : ''}{isr(Math.abs(net))}
      </Txt>

      <Box className="f-hero-divider" />

      <Box className="f-io">
        <Box className="f-io-card">
          <Txt className="f-io-icon inc"><ArrowUp size={14} strokeWidth={2} aria-hidden="true" /></Txt>
          <Box>
            <Box className="f-io-head">
              <Txt as="p" className="f-io-lbl">{t('summary.income')}</Txt>
              <DeltaPill delta={incomeDelta} t={t} />
            </Box>
            <Txt as="p" className="f-io-v mono">{isr(income)}</Txt>
          </Box>
        </Box>
        <Box className="f-io-card">
          <Txt className="f-io-icon exp"><ArrowDown size={14} strokeWidth={2} aria-hidden="true" /></Txt>
          <Box>
            <Box className="f-io-head">
              <Txt as="p" className="f-io-lbl">{t('summary.expenses')}</Txt>
              <DeltaPill delta={expenseDelta} t={t} />
            </Box>
            <Txt as="p" className="f-io-v mono">{isr(expenses)}</Txt>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
