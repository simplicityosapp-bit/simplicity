import { memo } from 'react'
import { Check, X, RotateCcw, Trash2 } from 'lucide-react'
import { isr } from '../../lib/finance'
import { payMethodLabel } from '../../lib/invoiceDocs'
import { fmtShortDate } from '../../lib/dates'
import { useT } from '../../i18n/useT'
import WhatsAppButton from '../../components/WhatsAppButton'
import { useWhatsAppMessage } from '../../hooks/useWhatsAppMessage'
import { Box, Txt, Btn } from '../../components/ui'

function TransactionCard({ tx, clients = [], projects = [], categories = [], onApprove, onSkip, onUnskip, onEdit, onDelete }) {
  const { t } = useT('finance')
  const waMsg = useWhatsAppMessage()
  const stop = (fn) => (e) => { e.stopPropagation(); fn() }
  const client = tx.client_id ? clients.find((c) => c.id === tx.client_id) : null
  const project = tx.project_id ? projects.find((p) => p.id === tx.project_id) : null
  const category = tx.category_id ? categories.find((c) => c.id === tx.category_id) : null
  /* Ad-hoc receipt recipient (no client) — show their name where the client name would be. */
  const recipientName = !client && tx.recipient_name ? tx.recipient_name : null
  const partyName = client?.name || recipientName
  const meta = [partyName, project?.name].filter(Boolean).join(' · ')
  const isExpense = tx.type === 'expense'
  const isPending = tx.status === 'pending'
  const isSkipped = tx.status === 'skipped'
  const isCredited = !!tx.invoice_credited_at // cancelled by a credit note → out of totals
  /* A receipt/invoice was issued and we hold its public document link →
     offer to send it to the client over WhatsApp (not credited). */
  const hasReceipt = !!tx.invoice_document_url && !isCredited
  const waVars = { name: partyName, number: tx.invoice_document_number, url: tx.invoice_document_url }
  const waMessage = hasReceipt ? waMsg(partyName ? 'receipt' : 'receiptNoName', waVars) : ''

  return (
    <Box
      className={`f-tx${isSkipped ? ' is-skipped' : ''}`}
      role={onEdit ? 'button' : undefined}
      tabIndex={onEdit ? 0 : undefined}
      onClick={() => onEdit?.(tx)}
      onKeyDown={onEdit ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(tx) } } : undefined}
    >
      <Box className="f-tx-body">
        <Txt as="p" className="f-tx-desc">{tx.desc || t('tx.noDesc')}</Txt>
        <Box className="f-tx-meta">
          <Txt className="f-tx-date">{fmtShortDate(tx.date)}</Txt>
          {isSkipped && <Txt className="f-tx-tag skip">{t('tx.skipped')}</Txt>}
          {isCredited && <Txt className="f-tx-tag credited">{t('tx.credited')}</Txt>}
          {meta && <Txt className="f-tx-meta-text">· {meta}</Txt>}
          {tx.payment_method && <Txt className="f-tx-tag pay">{payMethodLabel(tx.payment_method)}</Txt>}
          {category && (
            <Txt className="f-tx-cat">
              <Txt className="f-tx-cat-dot" style={{ background: category.color || 'var(--stone)' }} />
              {category.name}
            </Txt>
          )}
        </Box>
      </Box>

      <Txt as="p" className={`f-tx-amt mono ${isExpense ? 'exp' : 'inc'}${isSkipped || isCredited ? ' strike' : ''}`}>
        {isExpense ? '−' : '+'}{isr(tx.amount)}
      </Txt>

      {isPending ? (
        <Box className="f-tx-actions">
          <Btn type="button" className="f-tx-btn approve" onClick={stop(() => onApprove(tx.id))} title={t('tx.approveTitle')}>
            <Check size={15} strokeWidth={2} aria-hidden="true" />
          </Btn>
          <Btn type="button" className="f-tx-btn skip" onClick={stop(() => onSkip(tx.id))} title={t('tx.skipTitle')}>
            <X size={15} strokeWidth={2} aria-hidden="true" />
          </Btn>
        </Box>
      ) : (
        (isSkipped || hasReceipt || onDelete) && (
          <Box className="f-tx-actions">
            {isSkipped && (
              <Btn type="button" className="f-tx-btn restore" onClick={stop(() => onUnskip(tx.id))} title={t('tx.restore')} aria-label={t('tx.restore')}>
                <RotateCcw size={14} strokeWidth={1.8} aria-hidden="true" />
              </Btn>
            )}
            {hasReceipt && (
              <WhatsAppButton phone={client?.phone || tx.recipient_phone} message={waMessage} triggerClassName="f-tx-btn wa" />
            )}
            {onDelete && (
              <Btn type="button" className="f-tx-btn delete" onClick={stop(() => onDelete(tx.id))} title={t('tx.delete')} aria-label={t('tx.delete')}>
                <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
              </Btn>
            )}
          </Box>
        )
      )}
    </Box>
  )
}

export default memo(TransactionCard)
