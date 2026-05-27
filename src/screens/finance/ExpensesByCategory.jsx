import { useMemo } from 'react'
import { Tag } from 'lucide-react'
import { isr } from '../../lib/finance'

/* Distribute the month's confirmed expenses across categories.
   Expenses with no category land in "ללא קטגוריה". The bar's color
   comes from the category (preset palette) so the user reads the
   chart at a glance. */
export default function ExpensesByCategory({ monthTxs, categories = [] }) {
  const rows = useMemo(() => {
    const totals = new Map() /* categoryId | null → number */
    monthTxs.forEach((t) => {
      if (t.type !== 'expense') return
      if (t.status !== 'confirmed') return
      const cid = t.category_id || null
      totals.set(cid, (totals.get(cid) || 0) + Number(t.amount || 0))
    })
    const max = Math.max(0, ...totals.values())
    const out = []
    for (const [cid, sum] of totals) {
      if (!sum) continue
      const cat = cid ? categories.find((c) => c.id === cid) : null
      out.push({
        id: cid || 'none',
        name: cat?.name || 'ללא קטגוריה',
        color: cat?.color || 'var(--stone)',
        sum,
        pct: max > 0 ? Math.round((sum / max) * 100) : 0,
      })
    }
    return out.sort((a, b) => b.sum - a.sum)
  }, [monthTxs, categories])

  return (
    <section className="f-breakdown">
      <div className="f-breakdown-head">
        <span className="f-breakdown-title">
          <Tag size={15} strokeWidth={1.5} aria-hidden="true" />
          הוצאות לפי קטגוריה
        </span>
        {rows.length > 0 && <span className="f-breakdown-count mono">{rows.length}</span>}
      </div>
      {rows.length === 0 ? (
        <p className="f-breakdown-empty">אין הוצאות מסווגות החודש.</p>
      ) : (
        <div className="f-breakdown-list">
          {rows.map((r) => (
            <div key={r.id} className="f-breakdown-row">
              <div className="f-breakdown-row-head">
                <span className="f-breakdown-dot" style={{ background: r.color }} />
                <span className="f-breakdown-name">{r.name}</span>
                <span className="f-breakdown-amt mono">{isr(r.sum)}</span>
              </div>
              <div className="f-breakdown-bar">
                <div className="f-breakdown-fill" style={{ width: `${r.pct}%`, background: r.color }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
