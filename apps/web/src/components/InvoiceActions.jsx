import { memo, useEffect, useId, useRef, useState } from 'react'
import { FileText, ExternalLink, CircleAlert, Loader2 } from 'lucide-react'
import { useInvoiceProvider } from '../hooks/useInvoiceProvider'
import { useTransactions } from '../hooks/useTransactions'
import IssueGuardModal from '../modals/IssueGuardModal'
import ConfirmModal from '../modals/ConfirmModal'
import { isr } from '@simplicity/core'
import { showToast } from '../lib/toast'
import { PAY_METHODS, docTypeLabel, payMethodLabel, isReceiptType, allowedDocTypes, defaultDocType, clampDocType } from '../lib/invoiceDocs'
import { useT } from '../i18n/useT'
import './InvoiceActions.css'
import { Box, Txt, Btn, Input, Lnk } from './ui'

/* Same calendar-day key for two transactions (heuristic duplicate check). */
const dayKey = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null)

/* Map the function's coarse error CODE to a translated sentence (gender via
   useT context, matching the InvoiceCard convention so the same backend error
   reads the same way wherever it surfaces). */
function errMsg(code, t) {
  switch (code) {
    case 'already_issued': return t('actions.err.alreadyIssued')
    case 'already_credited': return t('actions.err.alreadyCredited')
    case 'not_issued': return t('actions.err.notIssued')
    case 'no_client': return t('actions.err.noClient')
    case 'doctype_for_business': return t('actions.err.docTypeForBusiness')
    case 'not_connected': return t('actions.err.notConnected')
    case 'not_income': return t('actions.err.notIncome')
    case 'bad_amount': return t('actions.err.badAmount')
    case 'transaction_not_found': return t('actions.err.transactionNotFound')
    case 'invalid_credentials': return t('actions.err.invalidCredentials')
    case 'provider_unreachable': return t('actions.err.providerUnreachable', { retry: t('actions.err.retry') })
    case 'provider_error': return t('actions.err.providerError')
    default: return t('actions.err.generic', { retry: t('actions.err.retry') })
  }
}

/* Append the provider's own one-line reason (when the function surfaced one)
   so a failed issuance is actionable instead of a generic "תקלה בספק". */
function errMsgWithDetail(e, t) {
  // morning errorCode 2403 = the chosen document type isn't allowed for this
  // business type (a VAT-exempt עוסק פטור can't issue a tax invoice/receipt) —
  // give a precise "pick קבלה" instruction instead of the raw provider text.
  if (e?.detail && /\b2403\b/.test(e.detail)) return t('actions.err.docTypeForBusiness')
  const base = errMsg(e?.message, t)
  return e?.detail ? `${base} (${e.detail})` : base
}

/* "הפק חשבונית" for an income transaction. Renders nothing unless an invoice
   provider is connected. The user picks document type, the product/service
   line, and (for receipts) the payment method. Once issued, shows the number
   + a link; the server refuses to issue twice (idempotency). */
function InvoiceActions({ tx, clientName, onIssued, formDirty = false }) {
  const { t } = useT('connections')
  const inv = useInvoiceProvider()
  const { transactions } = useTransactions()
  const lblId = useId()
  const [guardOpen, setGuardOpen] = useState(false)
  const [issued, setIssued] = useState(
    tx?.invoice_document_id
      ? { number: tx.invoice_document_number, url: tx.invoice_document_url, type: tx.invoice_document_type }
      : null,
  )
  const [credited, setCredited] = useState(
    tx?.invoice_credited_at
      ? { number: tx.invoice_credit_document_number, url: tx.invoice_credit_document_url }
      : null,
  )
  const [creditConfirm, setCreditConfirm] = useState(false)
  const [creditErr, setCreditErr] = useState('')
  const [picking, setPicking] = useState(false)
  const [docType, setDocType] = useState('invoice_receipt')
  const [itemName, setItemName] = useState('')
  const [items, setItems] = useState([])
  const [itemId, setItemId] = useState('') // '' = custom free text
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogErr, setCatalogErr] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [busy, setBusy] = useState(false)
  const [confirmIssue, setConfirmIssue] = useState(false) // two-step confirm (irreversible)
  const [err, setErr] = useState('')

  const issueTimer = useRef(0)
  const pickerRef = useRef(null)
  const issuedRef = useRef(null)
  const justIssuedRef = useRef(false) // distinguishes a fresh issuance from the on-mount already-issued case

  /* Clear the confirm auto-disarm timer on unmount. */
  useEffect(() => () => window.clearTimeout(issueTimer.current), [])

  /* When the picker opens it replaces the focused trigger button, so move
     focus into the picker (otherwise it falls to <body>). */
  useEffect(() => { if (picking) pickerRef.current?.focus() }, [picking])

  /* After a fresh issuance, the success row replaces the focused button — move
     focus there and let screen readers announce it. Guarded so the on-mount
     already-issued state never steals focus. */
  useEffect(() => {
    if (issued && justIssuedRef.current) {
      justIssuedRef.current = false
      issuedRef.current?.focus()
    }
  }, [issued])

  if (inv.loading || !inv.status?.connected) return null

  /* Issue a credit note (זיכוי) that cancels the issued document. */
  const doCredit = async () => {
    setCreditErr('')
    try {
      const r = await inv.creditDocument(tx.id)
      const doc = r?.document
      setCredited({ number: doc?.number, url: doc?.url })
      showToast(doc?.number ? t('actions.creditedToastNumbered', { number: doc.number }) : t('actions.creditedToast'))
      onIssued?.() // refresh transactions → totals drop it + the list shows "בוטלה"
    } catch (e) {
      setCreditErr(errMsgWithDetail(e, t))
    }
  }

  if (issued) {
    return (
      <>
        <Box className="inv-act issued" ref={issuedRef} tabIndex={-1} role="status" aria-live="polite">
          <FileText size={15} strokeWidth={1.8} aria-hidden="true" />
          <Txt>
            {t('actions.issuedLabel', { docType: docTypeLabel(issued.type) })}
            {issued.number ? <> {t('actions.issuedNumber')} <bdi>{issued.number}</bdi></> : ''}
            {tx?.amount ? ` · ${isr(tx.amount)}` : ''}
          </Txt>
          {issued.url && (
            <Lnk href={issued.url} target="_blank" rel="noreferrer" className="inv-act-link">
              {t('actions.view')} <ExternalLink size={12} strokeWidth={1.8} aria-hidden="true" />
            </Lnk>
          )}
          {credited ? (
            <Txt className="inv-act-credited">{t('actions.cancelled')}{credited.number ? <> {t('actions.creditNumber')} <bdi>{credited.number}</bdi></> : ''}</Txt>
          ) : (
            <Btn type="button" className="inv-act-credit-btn" onClick={() => { setCreditErr(''); setCreditConfirm(true) }}>
              {t('actions.creditBtn')}
            </Btn>
          )}
        </Box>
        {creditErr && <Txt as="p" className="inv-act-err" role="alert"><CircleAlert size={13} strokeWidth={1.7} aria-hidden="true" /> {creditErr}</Txt>}
        <ConfirmModal
          open={creditConfirm}
          onClose={() => setCreditConfirm(false)}
          title={t('actions.creditModalTitle')}
          message={t('actions.creditModalMessage', { doc: `${docTypeLabel(issued.type)}${issued.number ? ` ${t('actions.issuedNumber')} ${issued.number}` : ''}`, amount: isr(tx?.amount || 0) })}
          confirmLabel={t('actions.creditConfirm')}
          danger
          onConfirm={doCredit}
        />
      </>
    )
  }

  if (inv.status?.credentials_invalid) {
    return (
      <Txt as="p" className="inv-act hint">
        {t('actions.credsInvalidHint')}
      </Txt>
    )
  }

  if (!tx?.client_id) {
    return (
      <Txt as="p" className="inv-act hint">
        {t('actions.needClientHint')}
      </Txt>
    )
  }

  /* Escalate to a two-step warning before issuing when something looks off:
     a likely duplicate (same client + amount + day already issued) or unsaved
     edits to the transaction (the document is issued from the SAVED tx). */
  const txDate = dayKey(tx.date)
  const duplicate = (transactions || []).some((t) =>
    t.id !== tx.id && !t.deleted_at && t.invoice_document_id
    && t.client_id === tx.client_id
    && Number(t.amount) === Number(tx.amount)
    && dayKey(t.date) === txDate,
  )
  const needsGuard = duplicate || formDirty
  const guardReasons = []
  if (duplicate) guardReasons.push(t('actions.dupReason', {
    client: clientName || t('actions.dupClientFallback'),
    amount: isr(tx.amount),
    date: txDate ? t('actions.dupReasonDate', { date: txDate }) : '',
  }))
  if (formDirty) guardReasons.push(t('actions.dirtyReason'))

  const openPicker = async () => {
    setErr(''); setCatalogErr(''); setConfirmIssue(false)
    setDocType(defaultDocType(inv.status?.business_type)) // עוסק פטור → קבלה
    setItemName(tx.desc || '')
    setItemId('')
    setPaymentMethod('bank_transfer')
    setPicking(true)
    setCatalogLoading(true)
    try {
      const list = await inv.loadItems()
      const arr = Array.isArray(list) ? list : []
      setItems(arr)
      // Both providers now link a catalog item by id: SUMIT via Item.ID, Green
      // Invoice via the income row's itemId (both honored server-side in
      // providers.ts). So when the account has a catalog, default the picker to
      // the first item for EITHER provider — the user can switch to another item
      // or to free text ("אחר"). (Previously GI defaulted to free text because its
      // createDocument ignored the id; that gap is now closed.)
      if (arr.length) setItemId(String(arr[0].id))
    } catch {
      setItems([])
      setCatalogErr(t('actions.catalogError'))
    } finally { setCatalogLoading(false) }
  }

  const doIssue = async () => {
    setErr(''); setBusy(true)
    const selected = items.find((it) => String(it.id) === String(itemId))
    try {
      // Defensive clamp: if the business type changed while the picker was open,
      // never submit a doc type the business can't issue.
      const r = await inv.issueDocument(tx.id, clampDocType(inv.status?.business_type, docType), {
        itemId: itemId || null,
        itemName: itemId ? (selected?.name || '') : itemName.trim(),
        paymentMethod,
      })
      const doc = r?.document
      const type = doc?.type || docType
      justIssuedRef.current = true
      setIssued({ number: doc?.number, url: doc?.url, type })
      setPicking(false)
      showToast(doc?.number
        ? t('actions.issuedToastNumbered', { docType: docTypeLabel(type), number: doc.number })
        : t('actions.issuedToast', { docType: docTypeLabel(type) }))
      onIssued?.()
    } catch (e) {
      setErr(errMsgWithDetail(e, t))
    } finally {
      setBusy(false)
    }
  }

  /* Two-step confirm on the (irreversible) issue: first click arms + shows the
     amount, second click issues. Auto-disarms after 4s. When something looks
     off (duplicate / unsaved edits) we escalate to the explicit guard dialog. */
  const onIssueClick = () => {
    if (needsGuard) { window.clearTimeout(issueTimer.current); setConfirmIssue(false); setGuardOpen(true); return }
    if (!confirmIssue) {
      setConfirmIssue(true)
      window.clearTimeout(issueTimer.current)
      issueTimer.current = window.setTimeout(() => setConfirmIssue(false), 4000)
      return
    }
    window.clearTimeout(issueTimer.current)
    setConfirmIssue(false)
    doIssue()
  }

  const cancelPicker = () => { setPicking(false); setConfirmIssue(false) }

  /* Escape cancels the sub-step only — without stopPropagation it bubbles to
     the parent Modal's window listener and closes the whole edit modal. */
  const onPickerKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); cancelPicker() }
  }

  return (
    <Box className="inv-act">
      {!picking ? (
        <Btn type="button" className="inv-act-btn" onClick={openPicker}>
          <FileText size={15} strokeWidth={1.8} aria-hidden="true" /> {t('actions.issueBtn')}
        </Btn>
      ) : (
        <Box className="inv-act-picker" ref={pickerRef} tabIndex={-1} role="group" aria-labelledby={lblId} onKeyDown={onPickerKeyDown}>
          <Txt id={lblId} className="inv-act-picker-lbl">{clientName ? t('actions.pickerLabelNamed', { client: clientName }) : t('actions.pickerLabel')}</Txt>
          <Box className="inv-act-types" role="radiogroup" aria-label={t('actions.docTypeAria')}>
            {allowedDocTypes(inv.status?.business_type).map((d) => (
              <Btn key={d.key} type="button" role="radio" aria-checked={docType === d.key} className={`inv-act-type${docType === d.key ? ' on' : ''}`} onClick={() => setDocType(d.key)}>{docTypeLabel(d.key)}</Btn>
            ))}
          </Box>
          <Box as="label" className="inv-act-field">
            <Txt className="inv-act-field-lbl">{t('actions.itemFieldLabel')}</Txt>
            {catalogLoading && <Txt className="inv-act-loading" role="status" aria-live="polite">{t('actions.loadingItems')}</Txt>}
            {!catalogLoading && items.length > 0 && (
              <select className="inv-act-select" value={itemId} onChange={(e) => setItemId(e.target.value)}>
                {items.map((it) => <option key={it.id} value={it.id}>{it.name}{it.price != null ? ` · ${isr(it.price)}` : ''}</option>)}
                <option value="">{t('actions.itemOther')}</option>
              </select>
            )}
            {!catalogLoading && (items.length === 0 || itemId === '') && (
              <Input type="text" className="inv-act-input" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder={t('actions.itemPlaceholder')} />
            )}
            {!catalogLoading && items.length > 0 && (
              <Txt className="inv-act-hint-cap">{t('actions.itemHint')}</Txt>
            )}
            {catalogErr && <Txt className="inv-act-hint-cap" role="status">{catalogErr}</Txt>}
          </Box>
          {isReceiptType(docType) && (
            <Box as="label" className="inv-act-field">
              <Txt className="inv-act-field-lbl">{t('actions.payMethodLabel')}</Txt>
              <select className="inv-act-select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                {PAY_METHODS.map((m) => <option key={m.key} value={m.key}>{payMethodLabel(m.key)}</option>)}
              </select>
            </Box>
          )}
          <Box className="inv-act-picker-actions">
            <Btn type="button" className="inv-act-go" disabled={busy || (!itemId && !itemName.trim())} aria-busy={busy} onClick={onIssueClick}>
              {busy
                ? <><Loader2 size={14} strokeWidth={2} className="inv-act-spin" aria-hidden="true" /> {t('actions.issuing')}</>
                : confirmIssue
                  ? t('actions.issueConfirm', { amount: isr(tx.amount) })
                  : t('actions.issue')}
            </Btn>
            <Btn type="button" className="inv-act-cancel" disabled={busy} onClick={cancelPicker}>{t('actions.cancel')}</Btn>
          </Box>
        </Box>
      )}
      {err && <Txt as="p" className="inv-act-err" role="alert"><CircleAlert size={13} strokeWidth={1.7} aria-hidden="true" /> {err}</Txt>}
      <IssueGuardModal open={guardOpen} reasons={guardReasons} amount={tx.amount} onClose={() => setGuardOpen(false)} onConfirm={doIssue} />
    </Box>
  )
}

export default memo(InvoiceActions)
