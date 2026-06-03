import { AlertCircle, Check, X, Trash2 } from 'lucide-react'
import { isr } from '../../lib/finance'
import { fmtShortDate } from '../../lib/dates'
import './PendingSection.css'

/* Dedicated pending-transactions section. Mirrors the prototype's
   f-pending-section: a prominent attention card listing each pending
   tx with confirm + skip + click-to-edit, plus a bulk "אשר הכל" button
   that confirms every visible pending row. Hidden when nothing's
   pending. */
export default function PendingSection({ transactions, clients = [], projects = [], categories = [], onApprove, onSkip, onEdit, onDelete }) {
  if (!transactions.length) return null

  const totalIncome = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalExpense = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  return (
    <section className="f-pending">
      <div className="f-pending-head">
        <span className="f-pending-icon">
          <AlertCircle size={15} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="f-pending-id">
          <p className="f-pending-title">{transactions.length} תנועות ממתינות</p>
          <p className="f-pending-sub">
            {totalIncome > 0 && <>הכנסות {isr(totalIncome)}</>}
            {totalIncome > 0 && totalExpense > 0 && ' · '}
            {totalExpense > 0 && <>הוצאות {isr(totalExpense)}</>}
          </p>
        </div>
        {transactions.length > 1 && (
          <button
            type="button"
            className="f-pending-bulk"
            onClick={async () => {
              /* Sequential await so optimistic state updates in setStatus
                 don't trample each other — same pattern as bulkChangeMeta
                 in clients. Catch per-row so one failure doesn't abort. */
              for (const t of transactions) {
                // eslint-disable-next-line no-await-in-loop
                await Promise.resolve(onApprove(t.id)).catch(() => {})
              }
            }}
          >
            <Check size={13} strokeWidth={1.9} aria-hidden="true" /> אשר הכל
          </button>
        )}
      </div>
      <div className="f-pending-list">
        {transactions.map((t) => {
          const client = t.client_id ? clients.find((c) => c.id === t.client_id) : null
          const project = t.project_id ? projects.find((p) => p.id === t.project_id) : null
          const category = t.category_id ? categories.find((c) => c.id === t.category_id) : null
          const meta = [client?.name, project?.name].filter(Boolean).join(' · ')
          const isExpense = t.type === 'expense'
          return (
            <div
              key={t.id}
              className="f-pending-row"
              role="button"
              tabIndex={0}
              onClick={() => onEdit?.(t)}
            >
              <div className="f-pending-row-id">
                <p className="f-pending-desc">{t.desc || 'ללא תיאור'}</p>
                <p className="f-pending-meta">
                  <span>{fmtShortDate(t.date)}</span>
                  {meta && <><span className="f-pending-dot">·</span><span>{meta}</span></>}
                  {category && (
                    <>
                      <span className="f-pending-dot">·</span>
                      <span className="f-pending-cat">
                        <span className="f-pending-cat-dot" style={{ background: category.color || 'var(--stone)' }} />
                        {category.name}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <p className={`f-pending-amt mono ${isExpense ? 'exp' : 'inc'}`}>
                {isExpense ? '−' : '+'}{isr(t.amount)}
              </p>
              <div className="f-pending-actions">
                <button
                  type="button"
                  className="f-tx-btn approve"
                  onClick={(e) => { e.stopPropagation(); onApprove(t.id) }}
                  title="אשר"
                  aria-label="אשר"
                >
                  <Check size={14} strokeWidth={2} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="f-tx-btn skip"
                  onClick={(e) => { e.stopPropagation(); onSkip(t.id) }}
                  title="דלג"
                  aria-label="דלג"
                >
                  <X size={14} strokeWidth={2} aria-hidden="true" />
                </button>
                {onDelete && (
                  <button
                    type="button"
                    className="f-tx-btn delete"
                    onClick={(e) => { e.stopPropagation(); onDelete(t.id) }}
                    title="מחק"
                    aria-label="מחק"
                  >
                    <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
