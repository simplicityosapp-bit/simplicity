import { useState } from 'react'
import Modal from './Modal'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn } from '../components/ui'

/* Generic confirmation dialog. The confirm is guarded against double-taps
   and awaits an async onConfirm so a slow delete can't be fired twice. */
export default function ConfirmModal({ open, onClose, title, message, confirmLabel, cancelLabel, danger = false, onConfirm }) {
  const { t } = useT('modalsSystem')
  const [busy, setBusy] = useState(false)
  const confirm = async () => {
    if (busy) return
    try { setBusy(true); await onConfirm?.() } finally { setBusy(false); onClose() }
  }
  return (
    <Modal open={open} onClose={onClose} title={title ?? t('confirm.title')}>
      <Txt as="p" className="m-confirm-msg">{message}</Txt>
      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={onClose} disabled={busy}>{cancelLabel ?? t('confirm.cancel')}</Btn>
        <Btn
          type="button"
          className={`m-btn-save${danger ? ' danger' : ''}`}
          onClick={confirm}
          disabled={busy}
        >
          {busy ? '…' : (confirmLabel ?? t('confirm.title'))}
        </Btn>
      </Box>
    </Modal>
  )
}
