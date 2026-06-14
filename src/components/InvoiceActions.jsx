import { useState } from 'react'
import { FileText, ExternalLink, CircleAlert } from 'lucide-react'
import { useInvoiceProvider } from '../hooks/useInvoiceProvider'
import './InvoiceActions.css'

/* The three document types the user picks per issuance (covers עוסק פטור →
   receipt and עוסק מורשה → invoice_receipt without assuming a tax status). */
const DOC_TYPES = [
  { key: 'invoice_receipt', label: 'חשבונית מס קבלה' },
  { key: 'receipt', label: 'קבלה' },
  { key: 'invoice', label: 'חשבונית מס' },
]
/* Payment methods (shown for receipt-type docs). Map to provider codes server-side. */
const PAY_METHODS = [
  { key: 'bank_transfer', label: 'העברה בנקאית' },
  { key: 'cash', label: 'מזומן' },
  { key: 'credit_card', label: 'כרטיס אשראי' },
  { key: 'cheque', label: 'צ׳ק' },
  { key: 'app', label: 'אפליקציה (ביט/פייבוקס)' },
  { key: 'other', label: 'אחר' },
]
const docTypeLabel = (k) => DOC_TYPES.find((d) => d.key === k)?.label || k
const isReceiptType = (t) => t === 'invoice_receipt' || t === 'receipt'

function errToHe(code) {
  switch (code) {
    case 'already_issued': return 'כבר הופקה חשבונית לתנועה הזו.'
    case 'no_client': return 'כדי להפיק חשבונית צריך לשייך לקוח לתנועה ולשמור.'
    case 'not_connected': return 'אין חיבור לשירות חשבוניות — חברו אותו במסך החיבורים.'
    case 'not_income': return 'אפשר להפיק חשבונית רק לתנועת הכנסה.'
    case 'invalid_credentials': return 'פרטי ההזדהות לשירות שגויים — בדקו במסך החיבורים.'
    case 'provider_unreachable': return 'השירות לא זמין כרגע. נסו שוב בעוד רגע.'
    default: return 'ההפקה נכשלה. נסו שוב.'
  }
}

/* "הפק חשבונית" for an income transaction. Renders nothing unless an invoice
   provider is connected. The user picks document type, the product/service
   line, and (for receipts) the payment method. Once issued, shows the number
   + a link; the server refuses to issue twice (idempotency). */
export default function InvoiceActions({ tx, clientName, onIssued }) {
  const inv = useInvoiceProvider()
  const [issued, setIssued] = useState(
    tx?.invoice_document_id
      ? { number: tx.invoice_document_number, url: tx.invoice_document_url, type: tx.invoice_document_type }
      : null,
  )
  const [picking, setPicking] = useState(false)
  const [docType, setDocType] = useState('invoice_receipt')
  const [itemName, setItemName] = useState('')
  const [items, setItems] = useState([])
  const [itemId, setItemId] = useState('') // '' = custom free text
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (inv.loading || !inv.status?.connected) return null

  if (issued) {
    return (
      <div className="inv-act issued">
        <FileText size={15} strokeWidth={1.8} aria-hidden="true" />
        <span>הופקה {docTypeLabel(issued.type)}{issued.number ? ` מס׳ ${issued.number}` : ''}</span>
        {issued.url && (
          <a href={issued.url} target="_blank" rel="noreferrer" className="inv-act-link">
            צפייה <ExternalLink size={12} strokeWidth={1.8} aria-hidden="true" />
          </a>
        )}
      </div>
    )
  }

  if (!tx?.client_id) {
    return <p className="inv-act hint">כדי להפיק חשבונית — שייכו לקוח לתנועה ושמרו.</p>
  }

  const openPicker = async () => {
    setErr('')
    setDocType('invoice_receipt')
    setItemName(tx.desc || '')
    setItemId('')
    setPaymentMethod('bank_transfer')
    setPicking(true)
    try { const list = await inv.loadItems(); setItems(Array.isArray(list) ? list : []) } catch { setItems([]) }
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
      setIssued({ number: doc?.number, url: doc?.url, type: doc?.type || docType })
      setPicking(false)
      onIssued?.()
    } catch (e) {
      setErr(errToHe(e.message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="inv-act">
      {!picking ? (
        <button type="button" className="inv-act-btn" onClick={openPicker}>
          <FileText size={15} strokeWidth={1.8} aria-hidden="true" /> הפק חשבונית
        </button>
      ) : (
        <div className="inv-act-picker">
          <span className="inv-act-picker-lbl">הפקת מסמך{clientName ? ` · ${clientName}` : ''}</span>
          <div className="inv-act-types">
            {DOC_TYPES.map((d) => (
              <button key={d.key} type="button" className={`inv-act-type${docType === d.key ? ' on' : ''}`} onClick={() => setDocType(d.key)}>{d.label}</button>
            ))}
          </div>
          <label className="inv-act-field">
            <span className="inv-act-field-lbl">מוצר / שירות</span>
            {items.length > 0 && (
              <select className="inv-act-select" value={itemId} onChange={(e) => setItemId(e.target.value)}>
                {items.map((it) => <option key={it.id} value={it.id}>{it.name}{it.price != null ? ` · ₪${it.price}` : ''}</option>)}
                <option value="">אחר (טקסט חופשי)</option>
              </select>
            )}
            {(items.length === 0 || itemId === '') && (
              <input type="text" className="inv-act-input" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="לדוגמה: אימון אישי" />
            )}
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
            <button type="button" className="inv-act-go" disabled={busy} onClick={doIssue}>{busy ? 'מפיק…' : 'הפק'}</button>
            <button type="button" className="inv-act-cancel" disabled={busy} onClick={() => setPicking(false)}>ביטול</button>
          </div>
        </div>
      )}
      {err && <p className="inv-act-err"><CircleAlert size={13} strokeWidth={1.7} aria-hidden="true" /> {err}</p>}
    </div>
  )
}
