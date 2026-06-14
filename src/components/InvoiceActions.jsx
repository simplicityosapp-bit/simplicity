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
const docTypeLabel = (k) => DOC_TYPES.find((d) => d.key === k)?.label || k

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
   provider is connected. Once issued, shows the document number + a link, and
   the server refuses to issue twice (idempotency). */
export default function InvoiceActions({ tx, clientName, onIssued }) {
  const inv = useInvoiceProvider()
  const [issued, setIssued] = useState(
    tx?.invoice_document_id
      ? { number: tx.invoice_document_number, url: tx.invoice_document_url, type: tx.invoice_document_type }
      : null,
  )
  const [picking, setPicking] = useState(false)
  const [busyType, setBusyType] = useState(null)
  const [err, setErr] = useState('')

  // Until status is known, and when no provider is connected, show nothing.
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

  const doIssue = async (docType) => {
    setErr(''); setBusyType(docType)
    try {
      const r = await inv.issueDocument(tx.id, docType)
      const doc = r?.document
      setIssued({ number: doc?.number, url: doc?.url, type: doc?.type || docType })
      setPicking(false)
      onIssued?.()
    } catch (e) {
      setErr(errToHe(e.message))
    } finally {
      setBusyType(null)
    }
  }

  return (
    <div className="inv-act">
      {!picking ? (
        <button type="button" className="inv-act-btn" onClick={() => { setErr(''); setPicking(true) }}>
          <FileText size={15} strokeWidth={1.8} aria-hidden="true" /> הפק חשבונית
        </button>
      ) : (
        <div className="inv-act-picker">
          <span className="inv-act-picker-lbl">בחרו סוג מסמך{clientName ? ` · ${clientName}` : ''}:</span>
          <div className="inv-act-types">
            {DOC_TYPES.map((d) => (
              <button key={d.key} type="button" className="inv-act-type" disabled={!!busyType} onClick={() => doIssue(d.key)}>
                {busyType === d.key ? 'מפיק…' : d.label}
              </button>
            ))}
          </div>
          <button type="button" className="inv-act-cancel" onClick={() => setPicking(false)} disabled={!!busyType}>ביטול</button>
        </div>
      )}
      {err && <p className="inv-act-err"><CircleAlert size={13} strokeWidth={1.7} aria-hidden="true" /> {err}</p>}
    </div>
  )
}
