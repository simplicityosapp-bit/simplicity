import { useEffect, useState } from 'react'
import Modal from './Modal'
import { useAddress } from '../hooks/useAddress'

/* ════════════════════════════════════════════════════════════════
   DeleteSubStatusModal — D22.
   ════════════════════════════════════════════════════════════════
   When a sub-status (client or lead) has assignees, ask what to do
   with them: move to another sub-status of the same meta, or leave
   them unassigned. Same flow for both flavors — pass the relevant
   API helpers in via props.
   ════════════════════════════════════════════════════════════════ */
export default function DeleteSubStatusModal({
  open, onClose,
  status,          /* the status row being deleted */
  peers = [],      /* sibling statuses of the same meta */
  onCount,         /* (statusId) => Promise<number> */
  onReassign,      /* (fromId, toId|null) => Promise<void> */
  onDelete,        /* (statusId) => Promise<void> */
}) {
  const { tryAgain } = useAddress()
  /* Parent passes key={status?.id || 'none'} so this component
     remounts fresh per status — no in-effect setState resets. */
  const [count, setCount] = useState(null)
  const [toId, setToId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open || !status) return
    let active = true
    onCount(status.id).then((n) => { if (active) setCount(n) }).catch((e) => {
      if (active) setErr(e.message || 'שגיאה בקריאת השיוכים')
    })
    return () => { active = false }
  }, [open, status, onCount])

  if (!status) return null

  const submit = async () => {
    setBusy(true)
    setErr('')
    try {
      if (count > 0) {
        await onReassign(status.id, toId || null)
      }
      await onDelete(status.id)
      onClose()
    } catch (e) {
      setErr('המחיקה נכשלה: ' + (e.message || tryAgain))
      setBusy(false)
    }
  }

  const title = `מחיקת תת-סטטוס "${status.display_name}"`

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {count === null ? (
        <p className="set-soon">בודק שיוכים…</p>
      ) : count === 0 ? (
        <>
          <p className="m-confirm-msg">אין שיוכים פעילים. אפשר למחוק.</p>
          {err && <p className="m-error">{err}</p>}
          <div className="m-actions">
            <button type="button" className="m-btn-cancel" onClick={onClose}>ביטול</button>
            <button type="button" className="m-btn-delete" onClick={submit} disabled={busy}>{busy ? 'מוחק…' : 'מחק'}</button>
          </div>
        </>
      ) : (
        <>
          <p className="m-confirm-msg">
            {count === 1
              ? 'שיוך אחד פעיל יושפע מהמחיקה.'
              : `${count} שיוכים פעילים יושפעו מהמחיקה.`}
          </p>
          <div className="m-field">
            <label className="m-label">לאן להעביר את השיוכים?</label>
            <select className="m-select" value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">— ללא שיוך —</option>
              {peers.filter((p) => p.id !== status.id).map((p) => (
                <option key={p.id} value={p.id}>{p.icon ? p.icon + ' ' : ''}{p.display_name}</option>
              ))}
            </select>
          </div>
          {err && <p className="m-error">{err}</p>}
          <div className="m-actions">
            <button type="button" className="m-btn-cancel" onClick={onClose}>ביטול</button>
            <button type="button" className="m-btn-delete" onClick={submit} disabled={busy}>{busy ? 'מוחק…' : 'מחק והעבר'}</button>
          </div>
        </>
      )}
    </Modal>
  )
}
