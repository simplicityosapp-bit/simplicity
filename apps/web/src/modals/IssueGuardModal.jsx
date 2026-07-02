import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import Modal from './Modal'
import { useT } from '../i18n/useT'
import { isr } from '@simplicity/core'
import { Box, Txt, Btn } from '../components/ui'

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
          <Box className="ig-warn">
            <TriangleAlert size={18} strokeWidth={1.8} aria-hidden="true" />
            <Box className="ig-warn-body">
              {reasons.map((r, i) => <Txt as="p" key={i} className="ig-warn-reason">{r}</Txt>)}
            </Box>
          </Box>
          <Box className="m-actions">
            <Btn type="button" className="m-btn-cancel" onClick={close}>{t('common.cancel')}</Btn>
            <Btn type="button" className="m-btn-save" onClick={() => setStage(2)}>
              {t('issueGuard.sure')}
            </Btn>
          </Box>
        </>
      ) : (
        <>
          <Txt as="p" className="m-confirm-msg">{t('issueGuard.finalMsg', { amount: isr(amount) })}</Txt>
          <Box className="m-actions">
            <Btn type="button" className="m-btn-cancel" onClick={() => setStage(1)} disabled={busy}>{t('common.back')}</Btn>
            <Btn type="button" className="m-btn-save danger" onClick={confirmFinal} disabled={busy}>
              {busy ? '…' : t('issueGuard.issue')}
            </Btn>
          </Box>
        </>
      )}
    </Modal>
  )
}
