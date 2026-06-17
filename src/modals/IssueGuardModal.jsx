import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import Modal from './Modal'
import { useT } from '../i18n/useT'
import { isr } from '../lib/finance'

/* Two-step guard shown before issuing a REAL (irreversible) tax document when
   something looks off — a likely duplicate (same client + amount + date was
   already issued) and/or unsaved edits to the transaction.
   Stage 1: spell out the reason(s) + "כן, אני בטוח/ה". Stage 2: a final
   irreversible confirm with the amount. Either stage can be cancelled.
   Stage is reset on every close (the single choke point) so the next open
   always starts at stage 1 — no setState-in-effect needed. */
export default function IssueGuardModal({ open, reasons = [], amount, onClose, onConfirm }) {
  const { t } = useT('modalsSystem')
  const [stage, setStage] = useState(1)
  const [busy, setBusy] = useState(false)

  const close = () => { setStage(1); setBusy(false); onClose() }

  const confirmFinal = async () => {
    if (busy) return
    try { setBusy(true); await onConfirm?.() } finally { close() }
  }

  return (
    <Modal open={open} onClose={close} title={stage === 1 ? t('issueGuard.title1') : t('issueGuard.title2')}>
      {stage === 1 ? (
        <>
          <div className="ig-warn">
            <TriangleAlert size={18} strokeWidth={1.8} aria-hidden="true" />
            <div className="ig-warn-body">
              {reasons.map((r, i) => <p key={i} className="ig-warn-reason">{r}</p>)}
            </div>
          </div>
          <div className="m-actions">
            <button type="button" className="m-btn-cancel" onClick={close}>{t('common.cancel')}</button>
            <button type="button" className="m-btn-save" onClick={() => setStage(2)}>
              {t('issueGuard.sure')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="m-confirm-msg">{t('issueGuard.finalMsg', { amount: isr(amount) })}</p>
          <div className="m-actions">
            <button type="button" className="m-btn-cancel" onClick={() => setStage(1)} disabled={busy}>{t('common.back')}</button>
            <button type="button" className="m-btn-save danger" onClick={confirmFinal} disabled={busy}>
              {busy ? '…' : t('issueGuard.issue')}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
