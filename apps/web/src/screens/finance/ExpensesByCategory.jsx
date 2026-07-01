import { useMemo } from 'react'
import { Tag } from 'lucide-react'
import { isr } from '../../lib/finance'
import { useT } from '../../i18n/useT'
import { Box, Txt } from '../../components/ui'

/* Distribute the month's confirmed expenses across categories.
   Expenses with no category land in "ללא קטגוריה". The bar's color
   comes from the category (preset palette) so the user reads the
   chart at a glance. */
export default function ExpensesByCategory({ monthTxs, categories = [] }) {
  const { t } = useT('finance')
  const rows = useMemo(() => {
    const totals = new Map() /* categoryId | null → number */
    monthTxs.forEach((tx) => {
      if (tx.type !== 'expense') return
      // Match the hero summary / net (sumConfirmed): exclude credited (cancelled
      // by a credit note) txs, else this breakdown overstates vs the total above.
      if (tx.status !== 'confirmed' || tx.invoice_credited_at) return
      const cid = tx.category_id || null
      totals.set(cid, (totals.get(cid) || 0) + Number(tx.amount || 0))
    })
    const max = Math.max(0, ...totals.values())
    const out = []
    for (const [cid, sum] of totals) {
      if (!sum) continue
      const cat = cid ? categories.find((c) => c.id === cid) : null
      out.push({
        id: cid || 'none',
        name: cat?.name || t('expensesByCategory.noCategory'),
        color: cat?.color || 'var(--stone)',
        sum,
        pct: max > 0 ? Math.round((sum / max) * 100) : 0,
      })
    }
    return out.sort((a, b) => b.sum - a.sum)
  }, [monthTxs, categories, t])

  return (
    <Box as="section" className="f-breakdown">
      <Box className="f-breakdown-head">
        <Txt className="f-breakdown-title">
          <Tag size={15} strokeWidth={1.5} aria-hidden="true" />
          {t('expensesByCategory.title')}
        </Txt>
        {rows.length > 0 && <Txt className="f-breakdown-count mono">{rows.length}</Txt>}
      </Box>
      {rows.length === 0 ? (
        <Txt as="p" className="f-breakdown-empty">{t('expensesByCategory.empty')}</Txt>
      ) : (
        <Box className="f-breakdown-list">
          {rows.map((r) => (
            <Box key={r.id} className="f-breakdown-row">
              <Box className="f-breakdown-row-head">
                <Txt className="f-breakdown-dot" style={{ background: r.color }} />
                <Txt className="f-breakdown-name">{r.name}</Txt>
                <Txt className="f-breakdown-amt mono">{isr(r.sum)}</Txt>
              </Box>
              <Box className="f-breakdown-bar">
                <Box className="f-breakdown-fill" style={{ width: `${r.pct}%`, background: r.color }} />
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
