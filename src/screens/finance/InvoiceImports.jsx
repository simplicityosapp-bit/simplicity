import { useState } from 'react'
import { FileDown, Check, X, ExternalLink } from 'lucide-react'
import { useInvoiceImports } from '../../hooks/useInvoiceImports'
import { isr } from '../../lib/finance'
import './InvoiceImports.css'

const typeLabel = (t) => ({ invoice_receipt: 'חשבונית מס קבלה', receipt: 'קבלה', invoice: 'חשבונית מס' }[t] || 'מסמך')

/* Route B: invoices issued in the external service, staged by the webhook,
   waiting for the user to import them as income. Renders nothing when empty. */
export default function InvoiceImports() {
  const { imports, loading, approve, dismiss } = useInvoiceImports()
  const [busy, setBusy] = useState(null)

  if (loading || imports.length === 0) return null

  const act = (fn, id) => async () => {
    setBusy(id)
    try { await fn(id) } catch { /* error surfaced by toast/next render */ } finally { setBusy(null) }
  }

  return (
    <section className="inv-imports">
      <div className="inv-imports-head">
        <FileDown size={16} strokeWidth={1.7} aria-hidden="true" />
        <span>{imports.length === 1 ? 'חשבונית אחת לייבוא' : `${imports.length} חשבוניות לייבוא`}</span>
      </div>
      <p className="inv-imports-sub">חשבוניות שהופקו בשירות החיצוני — לייבא כהכנסה?</p>
      <div className="inv-imports-list">
        {imports.map((imp) => (
          <div key={imp.id} className="inv-import">
            <div className="inv-import-main">
              <p className="inv-import-title">{typeLabel(imp.document_type)}{imp.document_number ? ` מס׳ ${imp.document_number}` : ''}</p>
              <p className="inv-import-meta">
                {imp.customer_name || 'ללא שם'}{imp.doc_date ? ` · ${imp.doc_date}` : ''}
                {imp.document_url ? <> · <a href={imp.document_url} target="_blank" rel="noreferrer" className="inv-import-link">צפייה <ExternalLink size={11} strokeWidth={1.8} aria-hidden="true" /></a></> : null}
              </p>
            </div>
            <p className="inv-import-amt mono">+{isr(imp.amount || 0)}</p>
            <div className="inv-import-actions">
              <button type="button" className="inv-import-btn approve" disabled={busy === imp.id} onClick={act(approve, imp.id)} title="ייבא כהכנסה" aria-label="ייבא כהכנסה">
                <Check size={15} strokeWidth={2} aria-hidden="true" />
              </button>
              <button type="button" className="inv-import-btn dismiss" disabled={busy === imp.id} onClick={act(dismiss, imp.id)} title="דחה" aria-label="דחה">
                <X size={15} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
