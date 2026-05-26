import { Check, X, RotateCcw } from 'lucide-react'
import { isr } from '../../lib/finance'
import { fmtShortDate } from '../../lib/dates'

export default function TransactionCard({ tx, clients = [], projects = [], onApprove, onSkip, onUnskip, onEdit }) {
  const stop = (fn) => (e) => { e.stopPropagation(); fn() }
  const client = tx.client_id ? clients.find((c) => c.id === tx.client_id) : null
  const project = tx.project_id ? projects.find((p) => p.id === tx.project_id) : null
  const meta = [client?.name, project?.name].filter(Boolean).join(' · ')
  const isExpense = tx.type === 'expense'
  const isPending = tx.status === 'pending'
  const isSkipped = tx.status === 'skipped'

  return (
    <div
      className={`f-tx${isSkipped ? ' is-skipped' : ''}`}
      role={onEdit ? 'button' : undefined}
      tabIndex={onEdit ? 0 : undefined}
      onClick={() => onEdit?.(tx)}
    >
      <div className="f-tx-body">
        <p className="f-tx-desc">{tx.desc || 'ללא תיאור'}</p>
        <div className="f-tx-meta">
          <span className="f-tx-date">{fmtShortDate(tx.date)}</span>
          {isSkipped && <span className="f-tx-tag skip">דולגה</span>}
          {meta && <span className="f-tx-meta-text">· {meta}</span>}
        </div>
      </div>

      <p className={`f-tx-amt mono ${isExpense ? 'exp' : 'inc'}${isSkipped ? ' strike' : ''}`}>
        {isExpense ? '−' : '+'}{isr(tx.amount)}
      </p>

      {isPending && (
        <div className="f-tx-actions">
          <button type="button" className="f-tx-btn approve" onClick={stop(() => onApprove(tx.id))} title="אשר — התנועה קרתה">
            <Check size={15} strokeWidth={2} aria-hidden="true" />
          </button>
          <button type="button" className="f-tx-btn skip" onClick={stop(() => onSkip(tx.id))} title="דלג — לא קרה">
            <X size={15} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      )}

      {isSkipped && (
        <button type="button" className="f-tx-btn restore" onClick={stop(() => onUnskip(tx.id))} title="החזר לממתינה">
          <RotateCcw size={14} strokeWidth={1.8} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
