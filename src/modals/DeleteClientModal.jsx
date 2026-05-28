import { useMemo, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import Modal from './Modal'
import { isr } from '../lib/finance'

/* Delete client(s) with explicit handling of their finances:
   - "השאר תנועות (כיתומות)" → updateTransaction with client_id=null +
     orphaned_from = {type:'client', name}. The transactions stay
     alive and visible in the finance screen with an "[name] · נמחק"
     tag so the user can still see the past payments.
   - "מחק יחד" → cascade soft-delete every linked transaction. The
     user can still restore from the trash drawer if it was a
     mistake.

   The modal handles a single client (`client`) or a batch
   (`clients` array). Both go through the same two-button choice. */
export default function DeleteClientModal({
  open, onClose,
  client = null, clients = null,
  transactions = [],
  onRemoveClient, onUpdateTransaction, onRemoveTransaction,
}) {
  const targets = useMemo(() => (clients?.length ? clients : (client ? [client] : [])), [client, clients])
  const targetIds = useMemo(() => new Set(targets.map((c) => c.id)), [targets])
  const linkedTxs = useMemo(
    () => (transactions || []).filter((t) => !t.deleted_at && t.client_id && targetIds.has(t.client_id)),
    [transactions, targetIds],
  )
  const linkedSum = linkedTxs.reduce((s, t) => s + (t.type === 'income' ? Number(t.amount || 0) : 0), 0)

  const [busy, setBusy] = useState(false)

  if (!targets.length) return <Modal open={open} onClose={onClose} title="מחיקת לקוח" />

  const title = targets.length === 1 ? `מחיקת ${targets[0].name}` : `מחיקת ${targets.length} לקוחות`

  const doKeep = async () => {
    if (busy) return
    setBusy(true)
    try {
      /* Orphan-tag each linked transaction. We tag by the name of the
         deleted client so it stays human-readable in the finance
         list even after the client row is gone. */
      const nameById = new Map(targets.map((c) => [c.id, c.name]))
      for (const tx of linkedTxs) {
        await onUpdateTransaction(tx.id, {
          client_id: null,
          orphaned_from: { type: 'client', name: nameById.get(tx.client_id) || 'לקוח שנמחק' },
        }).catch(() => {})
      }
      for (const c of targets) {
        await onRemoveClient(c.id).catch(() => {})
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const doCascade = async () => {
    if (busy) return
    setBusy(true)
    try {
      for (const tx of linkedTxs) {
        await onRemoveTransaction(tx.id).catch(() => {})
      }
      for (const c of targets) {
        await onRemoveClient(c.id).catch(() => {})
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="dcm-intro">
        {targets.length === 1
          ? 'בחר/י מה לעשות עם התנועות הקשורות ללקוח. אפשר לשחזר מהזבל תוך 30 יום.'
          : 'בחר/י מה לעשות עם התנועות הקשורות ללקוחות שנבחרו. אפשר לשחזר מהזבל תוך 30 יום.'}
      </p>

      <div className="dcm-summary">
        <div className="dcm-summary-row">
          <span className="dcm-summary-l">לקוחות</span>
          <span className="dcm-summary-v mono">{targets.length}</span>
        </div>
        <div className="dcm-summary-row">
          <span className="dcm-summary-l">תנועות קשורות</span>
          <span className="dcm-summary-v mono">{linkedTxs.length}</span>
        </div>
        {linkedSum > 0 && (
          <div className="dcm-summary-row">
            <span className="dcm-summary-l">הכנסות סה״כ</span>
            <span className="dcm-summary-v mono">{isr(linkedSum)}</span>
          </div>
        )}
      </div>

      <div className="dcm-choices">
        <button type="button" className="dcm-choice keep" onClick={doKeep} disabled={busy}>
          <span className="dcm-choice-title">השאר/י תנועות</span>
          <span className="dcm-choice-sub">
            התנועות יישארו ב"כסף" עם תווית "[שם] · נמחק". משמש כשרוצים לשמור היסטוריית חיובים.
          </span>
        </button>
        <button type="button" className="dcm-choice cascade" onClick={doCascade} disabled={busy}>
          <AlertCircle size={14} strokeWidth={1.8} aria-hidden="true" />
          <span className="dcm-choice-title">מחק/י את התנועות יחד</span>
          <span className="dcm-choice-sub">
            התנועות יעברו לזבל יחד עם הלקוח. שחזור הלקוח לא משחזר אותן אוטומטית.
          </span>
        </button>
      </div>

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose} disabled={busy}>ביטול</button>
      </div>
    </Modal>
  )
}
