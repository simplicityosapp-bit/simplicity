import { memo, useEffect, useId, useRef, useState } from 'react'
import { FileText, ExternalLink, CircleAlert, Loader2 } from 'lucide-react'
import { useInvoiceProvider } from '../hooks/useInvoiceProvider'
import { useTransactions } from '../hooks/useTransactions'
import { useAddress } from '../hooks/useAddress'
import IssueGuardModal from '../modals/IssueGuardModal'
import ConfirmModal from '../modals/ConfirmModal'
import { isr } from '../lib/finance'
import { showToast } from '../lib/toast'
import { DOC_TYPES, PAY_METHODS, docTypeLabel, isReceiptType } from '../lib/invoiceDocs'
import './InvoiceActions.css'

/* Same calendar-day key for two transactions (heuristic duplicate check). */
const dayKey = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null)

/* Map the function's coarse error CODE to a Hebrew sentence (gendered via
   addr, matching the InvoiceCard convention so the same backend error reads
   the same way wherever it surfaces). */
function errToHe(code, addr) {
  const tryAgain = addr({ male: 'נסה שוב', female: 'נסי שוב', neutral: 'נסה/י שוב' })
  switch (code) {
    case 'already_issued': return 'כבר הופקה חשבונית לתנועה הזו.'
    case 'already_credited': return 'כבר הופקה חשבונית זיכוי לתנועה הזו.'
    case 'not_issued': return 'אין מסמך להפיק לו זיכוי.'
    case 'no_client': return 'כדי להפיק חשבונית צריך לשייך לקוח לתנועה ולשמור.'
    case 'not_connected': return addr({ male: 'אין חיבור לשירות חשבוניות — חבר אותו במסך החיבורים.', female: 'אין חיבור לשירות חשבוניות — חברי אותו במסך החיבורים.', neutral: 'אין חיבור לשירות חשבוניות — חבר/י אותו במסך החיבורים.' })
    case 'not_income': return 'אפשר להפיק חשבונית רק לתנועת הכנסה.'
    case 'bad_amount': return addr({ male: 'לתנועה אין סכום חיובי — עדכן את הסכום ושמור.', female: 'לתנועה אין סכום חיובי — עדכני את הסכום ושמרי.', neutral: 'לתנועה אין סכום חיובי — עדכן/י את הסכום ושמור/י.' })
    case 'transaction_not_found': return addr({ male: 'התנועה לא נמצאה — רענן ונסה שוב.', female: 'התנועה לא נמצאה — רענני ונסי שוב.', neutral: 'התנועה לא נמצאה — רענן/י ונסה/י שוב.' })
    case 'invalid_credentials': return addr({ male: 'פרטי ההזדהות לשירות שגויים — בדוק במסך החיבורים.', female: 'פרטי ההזדהות לשירות שגויים — בדקי במסך החיבורים.', neutral: 'פרטי ההזדהות לשירות שגויים — בדוק/י במסך החיבורים.' })
    case 'provider_unreachable': return 'השירות לא זמין כרגע. ' + tryAgain + ' בעוד רגע.'
    case 'provider_error': return addr({ male: 'השירות לא הצליח להפיק את המסמך. בדוק את הפרטים ונסה שוב.', female: 'השירות לא הצליח להפיק את המסמך. בדקי את הפרטים ונסי שוב.', neutral: 'השירות לא הצליח להפיק את המסמך. בדוק/י את הפרטים ונסה/י שוב.' })
    default: return 'ההפקה נכשלה. ' + tryAgain + '.'
  }
}

/* "הפק חשבונית" for an income transaction. Renders nothing unless an invoice
   provider is connected. The user picks document type, the product/service
   line, and (for receipts) the payment method. Once issued, shows the number
   + a link; the server refuses to issue twice (idempotency). */
function InvoiceActions({ tx, clientName, onIssued, formDirty = false }) {
  const inv = useInvoiceProvider()
  const { transactions } = useTransactions()
  const { addr } = useAddress()
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
      showToast('הופקה חשבונית זיכוי' + (doc?.number ? ' מס׳ ' + doc.number : ''))
      onIssued?.() // refresh transactions → totals drop it + the list shows "בוטלה"
    } catch (e) {
      setCreditErr(errToHe(e.message, addr))
    }
  }

  if (issued) {
    return (
      <>
        <div className="inv-act issued" ref={issuedRef} tabIndex={-1} role="status" aria-live="polite">
          <FileText size={15} strokeWidth={1.8} aria-hidden="true" />
          <span>
            הופקה {docTypeLabel(issued.type)}
            {issued.number ? <> מס׳ <bdi>{issued.number}</bdi></> : ''}
            {tx?.amount ? ` · ${isr(tx.amount)}` : ''}
          </span>
          {issued.url && (
            <a href={issued.url} target="_blank" rel="noreferrer" className="inv-act-link">
              צפייה <ExternalLink size={12} strokeWidth={1.8} aria-hidden="true" />
            </a>
          )}
          {credited ? (
            <span className="inv-act-credited">· בוטלה{credited.number ? <> · זיכוי <bdi>{credited.number}</bdi></> : ''}</span>
          ) : (
            <button type="button" className="inv-act-credit-btn" onClick={() => { setCreditErr(''); setCreditConfirm(true) }}>
              {addr({ male: 'זכה / בטל', female: 'זכי / בטלי', neutral: 'זכה/י · בטל/י' })}
            </button>
          )}
        </div>
        {creditErr && <p className="inv-act-err" role="alert"><CircleAlert size={13} strokeWidth={1.7} aria-hidden="true" /> {creditErr}</p>}
        <ConfirmModal
          open={creditConfirm}
          onClose={() => setCreditConfirm(false)}
          title="חשבונית זיכוי"
          message={`להפיק חשבונית זיכוי שתבטל את ${docTypeLabel(issued.type)}${issued.number ? ` מס׳ ${issued.number}` : ''} על ${isr(tx?.amount || 0)}? נוצר מסמך מס אמיתי, וההכנסה תצא מהסיכומים.`}
          confirmLabel={addr({ male: 'כן, זכה', female: 'כן, זכי', neutral: 'כן, זכה/י' })}
          danger
          onConfirm={doCredit}
        />
      </>
    )
  }

  if (inv.status?.credentials_invalid) {
    return (
      <p className="inv-act hint">
        {addr({ male: 'החיבור לשירות החשבוניות אינו תקף — חדש אותו במסך החיבורים כדי להפיק.', female: 'החיבור לשירות החשבוניות אינו תקף — חדשי אותו במסך החיבורים כדי להפיק.', neutral: 'החיבור לשירות החשבוניות אינו תקף — חדש/י אותו במסך החיבורים כדי להפיק.' })}
      </p>
    )
  }

  if (!tx?.client_id) {
    return (
      <p className="inv-act hint">
        {addr({ male: 'כדי להפיק חשבונית — שייך לקוח לתנועה ושמור.', female: 'כדי להפיק חשבונית — שייכי לקוח לתנועה ושמרי.', neutral: 'כדי להפיק חשבונית — שייך/י לקוח לתנועה ושמור/י.' })}
      </p>
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
  if (duplicate) guardReasons.push(`כבר הופקה חשבונית עבור ${clientName || 'הלקוח'} על ${isr(tx.amount)}${txDate ? ` בתאריך ${txDate}` : ''} — ייתכן שזו כפילות.`)
  if (formDirty) guardReasons.push('יש שינויים שלא נשמרו בתנועה. המסמך יופק לפי הנתונים השמורים, לא לפי העריכות — כדאי לשמור קודם.')

  const openPicker = async () => {
    setErr(''); setCatalogErr(''); setConfirmIssue(false)
    setDocType('invoice_receipt')
    setItemName(tx.desc || '')
    setItemId('')
    setPaymentMethod('bank_transfer')
    setPicking(true)
    setCatalogLoading(true)
    try {
      const list = await inv.loadItems()
      const arr = Array.isArray(list) ? list : []
      setItems(arr)
      if (arr.length) setItemId(String(arr[0].id)) // default to a real catalog item, not free-text
    } catch {
      setItems([])
      setCatalogErr('לא הצלחנו לטעון את רשימת המוצרים — אפשר להקליד תיאור ידנית.')
    } finally { setCatalogLoading(false) }
  }

  const doIssue = async () => {
    setErr(''); setBusy(true)
    const selected = items.find((it) => String(it.id) === String(itemId))
    try {
      const r = await inv.issueDocument(tx.id, docType, {
        itemId: itemId || null,
        itemName: itemId ? (selected?.name || '') : itemName.trim(),
        paymentMethod,
      })
      const doc = r?.document
      const type = doc?.type || docType
      justIssuedRef.current = true
      setIssued({ number: doc?.number, url: doc?.url, type })
      setPicking(false)
      showToast('הופקה ' + docTypeLabel(type) + (doc?.number ? ' מס׳ ' + doc.number : ''))
      onIssued?.()
    } catch (e) {
      setErr(errToHe(e.message, addr))
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
    <div className="inv-act">
      {!picking ? (
        <button type="button" className="inv-act-btn" onClick={openPicker}>
          <FileText size={15} strokeWidth={1.8} aria-hidden="true" /> הפק חשבונית
        </button>
      ) : (
        <div className="inv-act-picker" ref={pickerRef} tabIndex={-1} role="group" aria-labelledby={lblId} onKeyDown={onPickerKeyDown}>
          <span id={lblId} className="inv-act-picker-lbl">הפקת מסמך{clientName ? ` · ${clientName}` : ''}</span>
          <div className="inv-act-types" role="radiogroup" aria-label="סוג מסמך">
            {DOC_TYPES.map((d) => (
              <button key={d.key} type="button" role="radio" aria-checked={docType === d.key} className={`inv-act-type${docType === d.key ? ' on' : ''}`} onClick={() => setDocType(d.key)}>{d.label}</button>
            ))}
          </div>
          <label className="inv-act-field">
            <span className="inv-act-field-lbl">מוצר / שירות</span>
            {catalogLoading && <span className="inv-act-loading" role="status" aria-live="polite">טוען מוצרים…</span>}
            {!catalogLoading && items.length > 0 && (
              <select className="inv-act-select" value={itemId} onChange={(e) => setItemId(e.target.value)}>
                {items.map((it) => <option key={it.id} value={it.id}>{it.name}{it.price != null ? ` · ${isr(it.price)}` : ''}</option>)}
                <option value="">אחר (טקסט חופשי)</option>
              </select>
            )}
            {!catalogLoading && (items.length === 0 || itemId === '') && (
              <input type="text" className="inv-act-input" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="לדוגמה: אימון אישי" />
            )}
            {!catalogLoading && items.length > 0 && (
              <span className="inv-act-hint-cap">{addr({ male: 'בחר פריט מהקטלוג של הספק, או כתוב תיאור חופשי.', female: 'בחרי פריט מהקטלוג של הספק, או כתבי תיאור חופשי.', neutral: 'בחר/י פריט מהקטלוג של הספק, או כתוב/כתבי תיאור חופשי.' })}</span>
            )}
            {catalogErr && <span className="inv-act-hint-cap" role="status">{catalogErr}</span>}
          </label>
          {isReceiptType(docType) && (
            <label className="inv-act-field">
              <span className="inv-act-field-lbl">אמצעי תשלום</span>
              <select className="inv-act-select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                {PAY_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </label>
          )}
          <div className="inv-act-picker-actions">
            <button type="button" className="inv-act-go" disabled={busy || (!itemId && !itemName.trim())} aria-busy={busy} onClick={onIssueClick}>
              {busy
                ? <><Loader2 size={14} strokeWidth={2} className="inv-act-spin" aria-hidden="true" /> מפיק…</>
                : confirmIssue
                  ? addr({ male: `בטוח? להפיק על ${isr(tx.amount)}`, female: `בטוחה? להפיק על ${isr(tx.amount)}`, neutral: `בטוח/ה? להפיק על ${isr(tx.amount)}` })
                  : 'הפק'}
            </button>
            <button type="button" className="inv-act-cancel" disabled={busy} onClick={cancelPicker}>ביטול</button>
          </div>
        </div>
      )}
      {err && <p className="inv-act-err" role="alert"><CircleAlert size={13} strokeWidth={1.7} aria-hidden="true" /> {err}</p>}
      <IssueGuardModal open={guardOpen} reasons={guardReasons} amount={tx.amount} onClose={() => setGuardOpen(false)} onConfirm={doIssue} />
    </div>
  )
}

export default memo(InvoiceActions)
