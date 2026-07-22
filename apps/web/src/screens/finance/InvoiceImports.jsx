import { useEffect, useRef, useState } from 'react'
import { FileDown, Check, X, ExternalLink, Loader2, TriangleAlert } from 'lucide-react'
import { useInvoiceImports } from '../../hooks/useInvoiceImports'
import { useTransactions } from '../../hooks/useTransactions'
import { useT } from '../../i18n/useT'
import { isr } from '@simplicity/core'
import ConfirmModal from '../../modals/ConfirmModal'
import './InvoiceImports.css'
import { Box, Txt, Btn, Lnk } from '../../components/ui'

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
  /* Approve creates a real income transaction, so it asks first. It used to
     arm the button in place ("בטוח/ה?") and disarm itself after 4 seconds —
     a control that changes meaning and then silently changes back is the
     kind of thing that loses people. A plain dialog says what will happen
     and waits. `dup` marks the extra "you may already have this" warning. */
  const [confirmImport, setConfirmImport] = useState(null) // { imp, dup }
  const [liveMsg, setLiveMsg] = useState('')

  /* Possible duplicate: an existing income for the SAME client + amount (e.g. you
     already logged this payment manually). The poll already dedups by document id,
     so this catches an unlinked manual entry — a soft warning, never a block. */
  const possibleDuplicate = (imp) => !!imp.client_id && (transactions || []).some((tx) =>
    tx.type === 'income' && !tx.deleted_at && tx.client_id === imp.client_id && Number(tx.amount) === Number(imp.amount)
  )
  const liveTimer = useRef(0)

  useEffect(() => () => window.clearTimeout(liveTimer.current), [])

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

  /* Both paths — plain and possible-duplicate — open the same dialog; only
     the wording differs. Dismiss is reversible, so it stays one-tap. */
  const onApprove = (id) => () => {
    const imp = imports.find((x) => x.id === id)
    if (imp) setConfirmImport({ imp, dup: possibleDuplicate(imp) })
  }

  const onDismiss = (id) => () => act(dismiss, id, t('imports.dismissedToast'))()

  if (loading || (imports.length === 0 && !liveMsg)) return null
  /* Queue cleared but a result still needs announcing — keep the live region. */
  if (imports.length === 0) return <Txt className="sr-only" role="status" aria-live="polite">{liveMsg}</Txt>

  return (
    <Box as="section" className="inv-imports">
      <Box className="inv-imports-head">
        <FileDown size={16} strokeWidth={1.7} aria-hidden="true" />
        <Txt>{t('imports.heading')}</Txt>
        <Txt className="inv-imports-count" aria-live="polite" aria-label={t('imports.countAria', { count: imports.length })}>{imports.length}</Txt>
      </Box>
      <Txt as="p" className="inv-imports-sub">{t('imports.sub')}</Txt>
      <Box className="inv-imports-list">
        {imports.map((imp) => (
          <Box key={imp.id} className="inv-import">
            <Box className="inv-import-main">
              <Txt as="p" className="inv-import-title">{typeLabel(imp.document_type)}{imp.document_number ? <> {t('imports.docNumber')} <bdi>{imp.document_number}</bdi></> : ''}</Txt>
              <Txt as="p" className="inv-import-meta">
                {imp.customer_name || t('imports.noName')}{imp.doc_date ? ` · ${imp.doc_date}` : ''}
                {imp.document_url ? <> · <Lnk href={imp.document_url} target="_blank" rel="noreferrer" className="inv-import-link">{t('imports.view')} <ExternalLink size={11} strokeWidth={1.8} aria-hidden="true" /></Lnk></> : null}
                {possibleDuplicate(imp) ? <> · <Txt className="inv-import-dup"><TriangleAlert size={10} strokeWidth={2} aria-hidden="true" /> {t('imports.possibleDup')}</Txt></> : null}
              </Txt>
            </Box>
            <Txt as="p" className="inv-import-amt mono">+{isr(imp.amount || 0)}</Txt>
            <Box className="inv-import-actions">
              {busy === imp.id ? (
                <Btn type="button" className="inv-import-btn approve" disabled aria-busy="true" aria-label={t('imports.importingAria')}>
                  <Loader2 size={15} strokeWidth={2} className="inv-import-spin" aria-hidden="true" />
                </Btn>
              ) : (
                <Btn type="button" className="inv-import-btn approve" onClick={onApprove(imp.id)} title={t('imports.importTitle')} aria-label={t('imports.importAria')}>
                  <Check size={15} strokeWidth={2} aria-hidden="true" />
                </Btn>
              )}
              <Btn type="button" className="inv-import-btn dismiss" disabled={busy === imp.id} onClick={onDismiss(imp.id)} title={t('imports.dismiss')} aria-label={t('imports.dismiss')}>
                <X size={15} strokeWidth={2} aria-hidden="true" />
              </Btn>
            </Box>
          </Box>
        ))}
      </Box>
      <Txt className="sr-only" role="status" aria-live="polite">{liveMsg}</Txt>
      <ConfirmModal
        open={!!confirmImport}
        onClose={() => setConfirmImport(null)}
        title={confirmImport?.dup ? t('imports.dupTitle') : t('imports.confirmTitle')}
        message={confirmImport ? (confirmImport.dup
          ? t('imports.dupMessage', {
              amount: isr(confirmImport.imp.amount || 0),
              forName: confirmImport.imp.customer_name ? t('imports.dupForName', { name: confirmImport.imp.customer_name }) : '',
            })
          : t('imports.confirmMessage', {
              amount: isr(confirmImport.imp.amount || 0),
              forName: confirmImport.imp.customer_name ? t('imports.dupForName', { name: confirmImport.imp.customer_name }) : '',
            })
        ) : ''}
        confirmLabel={confirmImport?.dup ? t('imports.dupConfirm') : t('imports.confirmBtn')}
        cancelLabel={t('imports.cancel')}
        onConfirm={() => confirmImport && act(approve, confirmImport.imp.id, t('imports.importedToast'))()}
      />
    </Box>
  )
}
