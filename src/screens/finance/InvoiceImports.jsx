import { useEffect, useRef, useState } from 'react'
import { FileDown, Check, X, ExternalLink, Loader2, TriangleAlert } from 'lucide-react'
import { useInvoiceImports } from '../../hooks/useInvoiceImports'
import { useTransactions } from '../../hooks/useTransactions'
import { useT } from '../../i18n/useT'
import { isr } from '../../lib/finance'
import ConfirmModal from '../../modals/ConfirmModal'
import './InvoiceImports.css'

/* Route B: invoices issued in the external service, staged by the webhook,
   waiting for the user to import them as income. Renders nothing when empty. */
export default function InvoiceImports() {
  const { t } = useT('finance')
  const typeLabel = (type) => ({
    invoice_receipt: t('imports.typeInvoiceReceipt'),
    receipt: t('imports.typeReceipt'),
    invoice: t('imports.typeInvoice'),
  }[type] || t('imports.typeDoc'))
  const { imports, loading, approve, dismiss } = useInvoiceImports()
  const { transactions } = useTransactions()
  const [busy, setBusy] = useState(null)
  const [confirmId, setConfirmId] = useState(null) // approve = real income → two-step confirm
  const [dupConfirm, setDupConfirm] = useState(null) // an import flagged as a possible duplicate, awaiting a soft confirm
  const [liveMsg, setLiveMsg] = useState('')

  /* Possible duplicate: an existing income for the SAME client + amount (e.g. you
     already logged this payment manually). The poll already dedups by document id,
     so this catches an unlinked manual entry — a soft warning, never a block. */
  const possibleDuplicate = (imp) => !!imp.client_id && (transactions || []).some((tx) =>
    tx.type === 'income' && !tx.deleted_at && tx.client_id === imp.client_id && Number(tx.amount) === Number(imp.amount)
  )
  const confirmTimer = useRef(0)
  const liveTimer = useRef(0)

  useEffect(() => () => { window.clearTimeout(confirmTimer.current); window.clearTimeout(liveTimer.current) }, [])

  /* Politely announce the result for screen readers; the row itself just
     vanishes (and the whole section unmounts when the last one is handled). */
  const announce = (msg) => {
    setLiveMsg(msg)
    window.clearTimeout(liveTimer.current)
    liveTimer.current = window.setTimeout(() => setLiveMsg(''), 3000)
  }

  const act = (fn, id, msg) => async () => {
    setBusy(id)
    try { await fn(id); announce(msg) } catch { /* error surfaced by toast */ } finally { setBusy(null) }
  }

  /* Approve creates a real income transaction → arm on first tap, run on the
     second (auto-disarms after 4s). Dismiss is reversible, so it stays one-tap. */
  const onApprove = (id) => () => {
    const imp = imports.find((x) => x.id === id)
    // Possible duplicate → soft warning dialog (approve / cancel) instead of the
    // inline two-step.
    if (imp && possibleDuplicate(imp)) {
      window.clearTimeout(confirmTimer.current); setConfirmId(null)
      setDupConfirm(imp)
      return
    }
    if (confirmId !== id) {
      setConfirmId(id)
      window.clearTimeout(confirmTimer.current)
      confirmTimer.current = window.setTimeout(() => setConfirmId(null), 4000)
      return
    }
    window.clearTimeout(confirmTimer.current)
    setConfirmId(null)
    act(approve, id, t('imports.importedToast'))()
  }

  const onDismiss = (id) => () => {
    if (confirmId === id) { window.clearTimeout(confirmTimer.current); setConfirmId(null) }
    act(dismiss, id, t('imports.dismissedToast'))()
  }

  if (loading || (imports.length === 0 && !liveMsg)) return null
  /* Queue cleared but a result still needs announcing — keep the live region. */
  if (imports.length === 0) return <span className="sr-only" role="status" aria-live="polite">{liveMsg}</span>

  return (
    <section className="inv-imports">
      <div className="inv-imports-head">
        <FileDown size={16} strokeWidth={1.7} aria-hidden="true" />
        <span>{t('imports.heading')}</span>
        <span className="inv-imports-count" aria-live="polite" aria-label={t('imports.countAria', { count: imports.length })}>{imports.length}</span>
      </div>
      <p className="inv-imports-sub">{t('imports.sub')}</p>
      <div className="inv-imports-list">
        {imports.map((imp) => (
          <div key={imp.id} className="inv-import">
            <div className="inv-import-main">
              <p className="inv-import-title">{typeLabel(imp.document_type)}{imp.document_number ? <> {t('imports.docNumber')} <bdi>{imp.document_number}</bdi></> : ''}</p>
              <p className="inv-import-meta">
                {imp.customer_name || t('imports.noName')}{imp.doc_date ? ` · ${imp.doc_date}` : ''}
                {imp.document_url ? <> · <a href={imp.document_url} target="_blank" rel="noreferrer" className="inv-import-link">{t('imports.view')} <ExternalLink size={11} strokeWidth={1.8} aria-hidden="true" /></a></> : null}
                {possibleDuplicate(imp) ? <> · <span className="inv-import-dup"><TriangleAlert size={10} strokeWidth={2} aria-hidden="true" /> {t('imports.possibleDup')}</span></> : null}
              </p>
            </div>
            <p className="inv-import-amt mono">+{isr(imp.amount || 0)}</p>
            <div className="inv-import-actions">
              {busy === imp.id ? (
                <button type="button" className="inv-import-btn approve" disabled aria-busy="true" aria-label={t('imports.importingAria')}>
                  <Loader2 size={15} strokeWidth={2} className="inv-import-spin" aria-hidden="true" />
                </button>
              ) : confirmId === imp.id ? (
                <button type="button" className="inv-import-btn approve confirm" onClick={onApprove(imp.id)} aria-label={t('imports.confirmAria', { amount: isr(imp.amount || 0) })}>
                  <Check size={15} strokeWidth={2} aria-hidden="true" /> {t('imports.sure')}
                </button>
              ) : (
                <button type="button" className="inv-import-btn approve" onClick={onApprove(imp.id)} title={t('imports.importTitle')} aria-label={t('imports.importAria')}>
                  <Check size={15} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
              <button type="button" className="inv-import-btn dismiss" disabled={busy === imp.id} onClick={onDismiss(imp.id)} title={t('imports.dismiss')} aria-label={t('imports.dismiss')}>
                <X size={15} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only" role="status" aria-live="polite">{liveMsg}</span>
      <ConfirmModal
        open={!!dupConfirm}
        onClose={() => setDupConfirm(null)}
        title={t('imports.dupTitle')}
        message={dupConfirm ? t('imports.dupMessage', {
          amount: isr(dupConfirm.amount || 0),
          forName: dupConfirm.customer_name ? t('imports.dupForName', { name: dupConfirm.customer_name }) : '',
        }) : ''}
        confirmLabel={t('imports.dupConfirm')}
        cancelLabel={t('imports.cancel')}
        onConfirm={() => dupConfirm && act(approve, dupConfirm.id, t('imports.importedToast'))()}
      />
    </section>
  )
}
