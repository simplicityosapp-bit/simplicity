import { useState } from 'react'
import { AlertCircle, Check, X, Trash2 } from 'lucide-react'
import { isr } from '../../lib/finance'
import { fmtShortDate } from '@simplicity/core'
import { useT } from '../../i18n/useT'
import './PendingSection.css'
import { Box, Txt, Btn } from '../../components/ui'

/* Dedicated pending-transactions section. Mirrors the prototype's
   f-pending-section: a prominent attention card listing each pending
   tx with confirm + skip + click-to-edit, plus a bulk "אשר הכל" button
   that confirms every visible pending row. Hidden when nothing's
   pending. */
export default function PendingSection({ transactions, clients = [], projects = [], categories = [], onApprove, onSkip, onEdit, onDelete, embedded = false }) {
  const { t } = useT('finance')
  const [bulkBusy, setBulkBusy] = useState(false)
  if (!transactions.length) return null

  /* Sequential await so optimistic state updates in setStatus don't trample
     each other; catch per-row so one failure doesn't abort the rest. */
  const approveAll = async () => {
    if (bulkBusy) return
    setBulkBusy(true)
    try {
      for (const tx of transactions) {
        await Promise.resolve(onApprove(tx.id)).catch(() => {})
      }
    } finally {
      setBulkBusy(false)
    }
  }

  const totalIncome = transactions.filter((tx) => tx.type === 'income').reduce((s, tx) => s + tx.amount, 0)
  const totalExpense = transactions.filter((tx) => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0)

  /* `embedded` = rendered inside a Modal (the home "דרושה תשומת לב" popup):
     drop the amber card wrapper + the icon/title (the modal already has both)
     so it reads as one clean card, not a card-in-card with a doubled heading. */
  return (
    <Box as="section" className={`f-pending${embedded ? ' embedded' : ''}`}>
      <Box className="f-pending-head">
        {!embedded && (
          <Txt className="f-pending-icon">
            <AlertCircle size={15} strokeWidth={1.8} aria-hidden="true" />
          </Txt>
        )}
        <Box className="f-pending-id">
          {!embedded && <Txt as="p" className="f-pending-title">{t('pending.count', { count: transactions.length })}</Txt>}
          <Txt as="p" className="f-pending-sub">
            {totalIncome > 0 && <>{t('pending.income', { amount: isr(totalIncome) })}</>}
            {totalIncome > 0 && totalExpense > 0 && ' · '}
            {totalExpense > 0 && <>{t('pending.expenses', { amount: isr(totalExpense) })}</>}
          </Txt>
        </Box>
        {transactions.length > 1 && (
          <Btn
            type="button"
            className="f-pending-bulk"
            onClick={approveAll}
            disabled={bulkBusy}
          >
            <Check size={13} strokeWidth={1.9} aria-hidden="true" /> {bulkBusy ? t('pending.approving') : t('pending.approveAll')}
          </Btn>
        )}
      </Box>
      <Box className="f-pending-list">
        {transactions.map((tx) => {
          const client = tx.client_id ? clients.find((c) => c.id === tx.client_id) : null
          const project = tx.project_id ? projects.find((p) => p.id === tx.project_id) : null
          const category = tx.category_id ? categories.find((c) => c.id === tx.category_id) : null
          const meta = [client?.name, project?.name].filter(Boolean).join(' · ')
          const isExpense = tx.type === 'expense'
          return (
            <Box
              key={tx.id}
              className="f-pending-row"
              role="button"
              tabIndex={0}
              onClick={() => onEdit?.(tx)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit?.(tx) } }}
            >
              <Box className="f-pending-row-id">
                <Txt as="p" className="f-pending-desc">{tx.desc || t('pending.noDesc')}</Txt>
                <Txt as="p" className="f-pending-meta">
                  <Txt>{fmtShortDate(tx.date)}</Txt>
                  {meta && <><Txt className="f-pending-dot">·</Txt><Txt>{meta}</Txt></>}
                  {category && (
                    <>
                      <Txt className="f-pending-dot">·</Txt>
                      <Txt className="f-pending-cat">
                        <Txt className="f-pending-cat-dot" style={{ background: category.color || 'var(--stone)' }} />
                        {category.name}
                      </Txt>
                    </>
                  )}
                </Txt>
              </Box>
              <Txt as="p" className={`f-pending-amt mono ${isExpense ? 'exp' : 'inc'}`}>
                {isExpense ? '−' : '+'}{isr(tx.amount)}
              </Txt>
              <Box className="f-pending-actions">
                <Btn
                  type="button"
                  className="f-tx-btn approve"
                  onClick={(e) => { e.stopPropagation(); onApprove(tx.id) }}
                  title={t('pending.approve')}
                  aria-label={t('pending.approve')}
                >
                  <Check size={14} strokeWidth={2} aria-hidden="true" />
                </Btn>
                <Btn
                  type="button"
                  className="f-tx-btn skip"
                  onClick={(e) => { e.stopPropagation(); onSkip(tx.id) }}
                  title={t('pending.skip')}
                  aria-label={t('pending.skip')}
                >
                  <X size={14} strokeWidth={2} aria-hidden="true" />
                </Btn>
                {onDelete && (
                  <Btn
                    type="button"
                    className="f-tx-btn delete"
                    onClick={(e) => { e.stopPropagation(); onDelete(tx.id) }}
                    title={t('pending.delete')}
                    aria-label={t('pending.delete')}
                  >
                    <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                  </Btn>
                )}
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
