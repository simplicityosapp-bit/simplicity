import { useState } from 'react'
import Modal from './Modal'
import { useT } from '../i18n/useT'

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
      <p className="m-confirm-msg">{message}</p>
      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose} disabled={busy}>{cancelLabel ?? t('confirm.cancel')}</button>
        <button
          type="button"
          className={`m-btn-save${danger ? ' danger' : ''}`}
          onClick={confirm}
          disabled={busy}
        >
          {busy ? '…' : (confirmLabel ?? t('confirm.title'))}
        </button>
      </div>
    </Modal>
  )
}
