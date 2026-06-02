import Modal from './Modal'

/* Generic confirmation dialog. */
export default function ConfirmModal({ open, onClose, title = 'אישור', message, confirmLabel = 'אישור', cancelLabel = 'ביטול', danger = false, onConfirm }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="m-confirm-msg">{message}</p>
      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose}>{cancelLabel}</button>
        <button
          type="button"
          className={`m-btn-save${danger ? ' danger' : ''}`}
          onClick={() => { onConfirm?.(); onClose() }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
