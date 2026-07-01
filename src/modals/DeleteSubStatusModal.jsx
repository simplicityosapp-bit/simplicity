import { useEffect, useState } from 'react'
import Modal from './Modal'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn } from '../components/ui'

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
  const { t } = useT('modalsClient')
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
      if (active) setErr(e.message || t('deleteSubStatus.countError'))
    })
    return () => { active = false }
  }, [open, status, onCount, t])

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
      setErr(t('deleteSubStatus.deleteFailed', { error: e.message || t('common.tryAgain') }))
      setBusy(false)
    }
  }

  const title = t('deleteSubStatus.title', { name: status.display_name })

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {count === null ? (
        <Txt as="p" className="set-soon">{t('deleteSubStatus.checking')}</Txt>
      ) : count === 0 ? (
        <>
          <Txt as="p" className="m-confirm-msg">{t('deleteSubStatus.noneActive')}</Txt>
          {err && <Txt as="p" className="m-error">{err}</Txt>}
          <Box className="m-actions">
            <Btn type="button" className="m-btn-cancel" onClick={onClose}>{t('common.cancel')}</Btn>
            <Btn type="button" className="m-btn-delete" onClick={submit} disabled={busy}>{busy ? t('deleteSubStatus.deleting') : t('deleteSubStatus.delete')}</Btn>
          </Box>
        </>
      ) : (
        <>
          <Txt as="p" className="m-confirm-msg">{t('deleteSubStatus.affected', { count })}</Txt>
          <Box className="m-field">
            <Box as="label" className="m-label">{t('deleteSubStatus.reassignTo')}</Box>
            <select className="m-select" value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">{t('deleteSubStatus.unassigned')}</option>
              {peers.filter((p) => p.id !== status.id).map((p) => (
                <option key={p.id} value={p.id}>{p.icon ? p.icon + ' ' : ''}{p.display_name}</option>
              ))}
            </select>
          </Box>
          {err && <Txt as="p" className="m-error">{err}</Txt>}
          <Box className="m-actions">
            <Btn type="button" className="m-btn-cancel" onClick={onClose}>{t('common.cancel')}</Btn>
            <Btn type="button" className="m-btn-delete" onClick={submit} disabled={busy}>{busy ? t('deleteSubStatus.deleting') : t('deleteSubStatus.deleteAndMove')}</Btn>
          </Box>
        </>
      )}
    </Modal>
  )
}
