import { useEffect, useRef, useState } from 'react'
import { FileDown, Check, X, ExternalLink, Loader2 } from 'lucide-react'
import { useInvoiceImports } from '../../hooks/useInvoiceImports'
import { useAddress } from '../../hooks/useAddress'
import { isr } from '../../lib/finance'
import './InvoiceImports.css'

const typeLabel = (t) => ({ invoice_receipt: 'חשבונית מס קבלה', receipt: 'קבלה', invoice: 'חשבונית מס' }[t] || 'מסמך')

/* Route B: invoices issued in the external service, staged by the webhook,
   waiting for the user to import them as income. Renders nothing when empty. */
export default function InvoiceImports() {
  const { imports, loading, approve, dismiss } = useInvoiceImports()
  const { addr } = useAddress()
  const [busy, setBusy] = useState(null)
  const [confirmId, setConfirmId] = useState(null) // approve = real income → two-step confirm
  const [liveMsg, setLiveMsg] = useState('')
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
    if (confirmId !== id) {
      setConfirmId(id)
      window.clearTimeout(confirmTimer.current)
      confirmTimer.current = window.setTimeout(() => setConfirmId(null), 4000)
      return
    }
    window.clearTimeout(confirmTimer.current)
    setConfirmId(null)
    act(approve, id, 'החשבונית יובאה כהכנסה.')()
  }

  const onDismiss = (id) => () => {
    if (confirmId === id) { window.clearTimeout(confirmTimer.current); setConfirmId(null) }
    act(dismiss, id, 'החשבונית נדחתה.')()
  }

  if (loading || (imports.length === 0 && !liveMsg)) return null
  /* Queue cleared but a result still needs announcing — keep the live region. */
  if (imports.length === 0) return <span className="sr-only" role="status" aria-live="polite">{liveMsg}</span>

  return (
    <section className="inv-imports">
      <div className="inv-imports-head">
        <FileDown size={16} strokeWidth={1.7} aria-hidden="true" />
        <span aria-live="polite">{imports.length === 1 ? 'חשבונית אחת לייבוא' : `${imports.length} חשבוניות לייבוא`}</span>
      </div>
      <p className="inv-imports-sub">חשבוניות שהופקו בשירות החיצוני — לייבא כהכנסה?</p>
      <div className="inv-imports-list">
        {imports.map((imp) => (
          <div key={imp.id} className="inv-import">
            <div className="inv-import-main">
              <p className="inv-import-title">{typeLabel(imp.document_type)}{imp.document_number ? <> מס׳ <bdi>{imp.document_number}</bdi></> : ''}</p>
              <p className="inv-import-meta">
                {imp.customer_name || 'ללא שם'}{imp.doc_date ? ` · ${imp.doc_date}` : ''}
                {imp.document_url ? <> · <a href={imp.document_url} target="_blank" rel="noreferrer" className="inv-import-link">צפייה <ExternalLink size={11} strokeWidth={1.8} aria-hidden="true" /></a></> : null}
              </p>
            </div>
            <p className="inv-import-amt mono">+{isr(imp.amount || 0)}</p>
            <div className="inv-import-actions">
              {busy === imp.id ? (
                <button type="button" className="inv-import-btn approve" disabled aria-busy="true" aria-label="מייבא…">
                  <Loader2 size={15} strokeWidth={2} className="inv-import-spin" aria-hidden="true" />
                </button>
              ) : confirmId === imp.id ? (
                <button type="button" className="inv-import-btn approve confirm" onClick={onApprove(imp.id)} aria-label={`אישור ייבוא ${isr(imp.amount || 0)} כהכנסה`}>
                  <Check size={15} strokeWidth={2} aria-hidden="true" /> {addr({ male: 'בטוח?', female: 'בטוחה?', neutral: 'בטוח/ה?' })}
                </button>
              ) : (
                <button type="button" className="inv-import-btn approve" onClick={onApprove(imp.id)} title="ייבא כהכנסה" aria-label="ייבא כהכנסה">
                  <Check size={15} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
              <button type="button" className="inv-import-btn dismiss" disabled={busy === imp.id} onClick={onDismiss(imp.id)} title="דחה" aria-label="דחה">
                <X size={15} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only" role="status" aria-live="polite">{liveMsg}</span>
    </section>
  )
}
