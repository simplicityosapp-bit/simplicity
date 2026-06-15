import { memo } from 'react'
import { Check, X, RotateCcw, Trash2 } from 'lucide-react'
import { isr } from '../../lib/finance'
import { fmtShortDate } from '../../lib/dates'

function TransactionCard({ tx, clients = [], projects = [], categories = [], onApprove, onSkip, onUnskip, onEdit, onDelete }) {
  const stop = (fn) => (e) => { e.stopPropagation(); fn() }
  const client = tx.client_id ? clients.find((c) => c.id === tx.client_id) : null
  const project = tx.project_id ? projects.find((p) => p.id === tx.project_id) : null
  const category = tx.category_id ? categories.find((c) => c.id === tx.category_id) : null
  const meta = [client?.name, project?.name].filter(Boolean).join(' · ')
  const isExpense = tx.type === 'expense'
  const isPending = tx.status === 'pending'
  const isSkipped = tx.status === 'skipped'
  const isCredited = !!tx.invoice_credited_at // cancelled by a credit note → out of totals

  return (
    <div
      className={`f-tx${isSkipped ? ' is-skipped' : ''}`}
      role={onEdit ? 'button' : undefined}
      tabIndex={onEdit ? 0 : undefined}
      onClick={() => onEdit?.(tx)}
      onKeyDown={onEdit ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(tx) } } : undefined}
    >
      <div className="f-tx-body">
        <p className="f-tx-desc">{tx.desc || 'ללא תיאור'}</p>
        <div className="f-tx-meta">
          <span className="f-tx-date">{fmtShortDate(tx.date)}</span>
          {isSkipped && <span className="f-tx-tag skip">דילגת</span>}
          {isCredited && <span className="f-tx-tag credited">בוטלה</span>}
          {meta && <span className="f-tx-meta-text">· {meta}</span>}
          {category && (
            <span className="f-tx-cat">
              <span className="f-tx-cat-dot" style={{ background: category.color || 'var(--stone)' }} />
              {category.name}
            </span>
          )}
        </div>
      </div>

      <p className={`f-tx-amt mono ${isExpense ? 'exp' : 'inc'}${isSkipped || isCredited ? ' strike' : ''}`}>
        {isExpense ? '−' : '+'}{isr(tx.amount)}
      </p>

      {isPending ? (
        <div className="f-tx-actions">
          <button type="button" className="f-tx-btn approve" onClick={stop(() => onApprove(tx.id))} title="אשר — התנועה קרתה">
            <Check size={15} strokeWidth={2} aria-hidden="true" />
          </button>
          <button type="button" className="f-tx-btn skip" onClick={stop(() => onSkip(tx.id))} title="דלג — לא קרה">
            <X size={15} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      ) : (
        (isSkipped || onDelete) && (
          <div className="f-tx-actions">
            {isSkipped && (
              <button type="button" className="f-tx-btn restore" onClick={stop(() => onUnskip(tx.id))} title="החזר לממתינה" aria-label="החזר לממתינה">
                <RotateCcw size={14} strokeWidth={1.8} aria-hidden="true" />
              </button>
            )}
            {onDelete && (
              <button type="button" className="f-tx-btn delete" onClick={stop(() => onDelete(tx.id))} title="מחק תנועה" aria-label="מחק תנועה">
                <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
              </button>
            )}
          </div>
        )
      )}
    </div>
  )
}

export default memo(TransactionCard)
