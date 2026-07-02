import { useMemo, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import Modal from './Modal'
import { isr } from '@simplicity/core'
import { restoreClient } from '../lib/api/clients'
import { restoreTransaction } from '../lib/api/transactions'
import { pushUndo } from '../lib/undo'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn } from '../components/ui'

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
  const { t } = useT('modalsClient')
  const targets = useMemo(() => (clients?.length ? clients : (client ? [client] : [])), [client, clients])
  const targetIds = useMemo(() => new Set(targets.map((c) => c.id)), [targets])
  const linkedTxs = useMemo(
    () => (transactions || []).filter((t) => !t.deleted_at && t.client_id && targetIds.has(t.client_id)),
    [transactions, targetIds],
  )
  const linkedSum = linkedTxs.reduce((s, t) => s + (t.type === 'income' ? Number(t.amount || 0) : 0), 0)

  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()

  if (!targets.length) return <Modal open={open} onClose={onClose} title={t('deleteClient.title')} />

  const title = targets.length === 1 ? t('deleteClient.titleOne', { name: targets[0].name }) : t('deleteClient.titleMany', { count: targets.length })
  const undoLabel = targets.length === 1 ? t('deleteClient.undoOne', { name: targets[0].name }) : t('deleteClient.undoMany', { count: targets.length })

  const doKeep = async () => {
    if (busy) return
    setBusy(true)
    /* Snapshot the txs' original linkage so undo can re-attach them. */
    const nameById = new Map(targets.map((c) => [c.id, c.name]))
    const txSnap = linkedTxs.map((t) => ({ id: t.id, client_id: t.client_id, orphaned_from: t.orphaned_from ?? null }))
    const clientIds = targets.map((c) => c.id)
    /* Orphan-tag each linked transaction (kept visible in finance with a
       "[name] · נמחק" tag), then soft-delete the clients. */
    const apply = async () => {
      for (const tx of linkedTxs) {
        await onUpdateTransaction(tx.id, {
          client_id: null,
          orphaned_from: { type: 'client', name: nameById.get(tx.client_id) || t('deleteClient.orphanName') },
        }).catch(() => {})
      }
      for (const c of targets) {
        await onRemoveClient(c.id).catch(() => {})
      }
    }
    try {
      await apply()
      pushUndo({
        label: undoLabel,
        undo: async () => {
          for (const id of clientIds) { try { await restoreClient(id) } catch { /* keep going */ } }
          for (const s of txSnap) {
            await onUpdateTransaction(s.id, { client_id: s.client_id, orphaned_from: s.orphaned_from }).catch(() => {})
          }
          qc.invalidateQueries({ queryKey: ['clients'] })
          qc.invalidateQueries({ queryKey: ['transactions'] })
        },
        redo: apply,
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const doCascade = async () => {
    if (busy) return
    setBusy(true)
    const clientIds = targets.map((c) => c.id)
    const txIds = linkedTxs.map((t) => t.id)
    /* Cascade soft-delete: txs to trash alongside the clients. Undo here
       restores BOTH (a plain Trash restore of the client would not). */
    const apply = async () => {
      for (const tx of linkedTxs) {
        await onRemoveTransaction(tx.id).catch(() => {})
      }
      for (const c of targets) {
        await onRemoveClient(c.id).catch(() => {})
      }
    }
    try {
      await apply()
      pushUndo({
        label: undoLabel,
        undo: async () => {
          for (const id of clientIds) { try { await restoreClient(id) } catch { /* keep going */ } }
          for (const id of txIds) { try { await restoreTransaction(id) } catch { /* keep going */ } }
          qc.invalidateQueries({ queryKey: ['clients'] })
          qc.invalidateQueries({ queryKey: ['transactions'] })
        },
        redo: apply,
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <Txt as="p" className="dcm-intro">
        {targets.length === 1 ? t('deleteClient.introOne') : t('deleteClient.introMany')}
      </Txt>

      <Box className="dcm-summary">
        <Box className="dcm-summary-row">
          <Txt className="dcm-summary-l">{t('deleteClient.clients')}</Txt>
          <Txt className="dcm-summary-v mono">{targets.length}</Txt>
        </Box>
        <Box className="dcm-summary-row">
          <Txt className="dcm-summary-l">{t('deleteClient.linkedTransactions')}</Txt>
          <Txt className="dcm-summary-v mono">{linkedTxs.length}</Txt>
        </Box>
        {linkedSum > 0 && (
          <Box className="dcm-summary-row">
            <Txt className="dcm-summary-l">{t('deleteClient.totalIncome')}</Txt>
            <Txt className="dcm-summary-v mono">{isr(linkedSum)}</Txt>
          </Box>
        )}
      </Box>

      <Box className="dcm-choices">
        <Btn type="button" className="dcm-choice keep" onClick={doKeep} disabled={busy}>
          <Txt className="dcm-choice-title">{t('deleteClient.keepTitle')}</Txt>
          <Txt className="dcm-choice-sub">{t('deleteClient.keepSub')}</Txt>
        </Btn>
        <Btn type="button" className="dcm-choice cascade" onClick={doCascade} disabled={busy}>
          <AlertCircle size={14} strokeWidth={1.8} aria-hidden="true" />
          <Txt className="dcm-choice-title">{t('deleteClient.cascadeTitle')}</Txt>
          <Txt className="dcm-choice-sub">{t('deleteClient.cascadeSub')}</Txt>
        </Btn>
      </Box>

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={onClose} disabled={busy}>{t('common.cancel')}</Btn>
      </Box>
    </Modal>
  )
}
