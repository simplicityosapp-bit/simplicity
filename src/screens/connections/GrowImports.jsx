import { useEffect, useRef, useState } from 'react'
import { FileDown, Check, X, Loader2 } from 'lucide-react'
import { useGrowImports } from '../../hooks/useGrowImports'
import { useT } from '../../i18n/useT'
import { isr } from '../../lib/finance'
import '../finance/InvoiceImports.css' // reuse the import-list styles (inv-import*)

/* External Grow charges staged by grow-poll, waiting for the coach to import
   them as income. Approve = real income → two-step confirm; dismiss is one-tap.
   Renders nothing when there's nothing pending. Mirrors InvoiceImports. */
export default function GrowImports() {
  const { t } = useT('connections')
  const { imports, loading, approve, dismiss } = useGrowImports()
  const [busy, setBusy] = useState(null)
  const [confirmId, setConfirmId] = useState(null) // approve = real income → two-step confirm
  const confirmTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(confirmTimer.current), [])

  const act = (fn, id) => async () => {
    setBusy(id)
    try { await fn(id) } catch { /* error surfaced by toast */ } finally { setBusy(null) }
  }
  const onApprove = (id) => () => {
    if (confirmId !== id) {
      setConfirmId(id)
      window.clearTimeout(confirmTimer.current)
      confirmTimer.current = window.setTimeout(() => setConfirmId(null), 4000)
      return
    }
    window.clearTimeout(confirmTimer.current); setConfirmId(null)
    act(approve, id)()
  }
  const onDismiss = (id) => () => {
    if (confirmId === id) { window.clearTimeout(confirmTimer.current); setConfirmId(null) }
    act(dismiss, id)()
  }

  if (loading || imports.length === 0) return null

  return (
    <section className="inv-imports">
      <div className="inv-imports-head">
        <FileDown size={16} strokeWidth={1.7} aria-hidden="true" />
        <span>{t('growImports.heading')}</span>
        <span className="inv-imports-count" aria-label={t('growImports.countAria', { count: imports.length })}>{imports.length}</span>
      </div>
      <p className="inv-imports-sub">{t('growImports.sub')}</p>
      <div className="inv-imports-list">
        {imports.map((imp) => (
          <div key={imp.id} className="inv-import">
            <div className="inv-import-main">
              <p className="inv-import-title">{t('growImports.charge')}</p>
              <p className="inv-import-meta">{imp.customer_name || t('growImports.noName')}{imp.charge_date ? ` · ${imp.charge_date}` : ''}</p>
            </div>
            <p className="inv-import-amt mono">+{isr(imp.amount || 0)}</p>
            <div className="inv-import-actions">
              {busy === imp.id ? (
                <button type="button" className="inv-import-btn approve" disabled aria-busy="true" aria-label={t('growImports.importingAria')}>
                  <Loader2 size={15} strokeWidth={2} className="inv-import-spin" aria-hidden="true" />
                </button>
              ) : confirmId === imp.id ? (
                <button type="button" className="inv-import-btn approve confirm" onClick={onApprove(imp.id)} aria-label={t('growImports.confirmAria', { amount: isr(imp.amount || 0) })}>
                  <Check size={15} strokeWidth={2} aria-hidden="true" /> {t('growImports.sure')}
                </button>
              ) : (
                <button type="button" className="inv-import-btn approve" onClick={onApprove(imp.id)} title={t('growImports.import')} aria-label={t('growImports.import')}>
                  <Check size={15} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
              <button type="button" className="inv-import-btn dismiss" disabled={busy === imp.id} onClick={onDismiss(imp.id)} title={t('growImports.dismiss')} aria-label={t('growImports.dismiss')}>
                <X size={15} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
