import { Search, X } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn, Input } from '../../components/ui'

/* Search + type chips above the transaction list. Searching leaves month
   scope on purpose (see searchTransactions), so when anything is active the
   bar says so and offers one tap back to the month. */
export default function TransactionSearch({ query, onQuery, type, onType, active, resultCount, monthLabel, onClear }) {
  const { t } = useT('finance')
  const TYPES = [
    { key: 'all', label: t('search.typeAll') },
    { key: 'income', label: t('search.typeIncome') },
    { key: 'expense', label: t('search.typeExpense') },
  ]
  return (
    <Box className="f-search">
      <Box className="f-search-row">
        <Search size={15} strokeWidth={1.8} className="f-search-ic" aria-hidden="true" />
        <Input
          className="f-search-input"
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t('search.placeholder')}
          aria-label={t('search.ariaLabel')}
        />
        {query && (
          <Btn type="button" className="f-search-x" onClick={() => onQuery('')} aria-label={t('search.clearText')}>
            <X size={14} strokeWidth={2} aria-hidden="true" />
          </Btn>
        )}
      </Box>

      <Box className="f-search-chips" role="group" aria-label={t('search.typeGroupAria')}>
        {TYPES.map((c) => (
          <Btn
            key={c.key}
            type="button"
            className={`f-search-chip${type === c.key ? ' on' : ''}`}
            onClick={() => onType(c.key)}
            aria-pressed={type === c.key}
          >
            {c.label}
          </Btn>
        ))}
      </Box>

      {/* The list stops being "this month" the moment a filter is on. Saying so
          — and saying how to get back — is the whole reason cross-month search
          is safe to offer on a month-scoped screen. */}
      {active && (
        <Box className="f-search-note">
          <Txt as="p" className="f-search-note-text">
            {t('search.resultsAcrossTime', { count: resultCount })}
          </Txt>
          <Btn type="button" className="f-search-back" onClick={onClear}>
            {t('search.backToMonth', { month: monthLabel })}
          </Btn>
        </Box>
      )}
    </Box>
  )
}
