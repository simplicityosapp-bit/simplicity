import { useState } from 'react'
import Modal from './Modal'

/* Generic confirmation dialog. The confirm is guarded against double-taps
   and awaits an async onConfirm so a slow delete can't be fired twice. */
export default function ConfirmModal({ open, onClose, title = 'אישור', message, confirmLabel = 'אישור', cancelLabel = 'ביטול', danger = false, onConfirm }) {
  const [busy, setBusy] = useState(false)
  const confirm = async () => {
    if (busy) return
    try { setBusy(true); await onConfirm?.() } finally { setBusy(false); onClose() }
  }
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="m-confirm-msg">{message}</p>
      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose} disabled={busy}>{cancelLabel}</button>
        <button
          type="button"
          className={`m-btn-save${danger ? ' danger' : ''}`}
          onClick={confirm}
          disabled={busy}
        >
          {busy ? '…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
