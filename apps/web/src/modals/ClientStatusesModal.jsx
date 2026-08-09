import { useState } from 'react'
import { Plus, Trash2, Check, X } from 'lucide-react'
import Modal from './Modal'
import DeleteSubStatusModal from './DeleteSubStatusModal'
import { useClientStatuses } from '../hooks/useClientStatuses'
import { useClients } from '../hooks/useClients'
import {
  countClientsByStatus, reassignClientsStatus, reassignClientsStatusByIds, restoreClientStatus,
  removeClientStatus as apiRemoveStatus,
} from '../lib/api/clientStatuses'
import { pushUndo } from '../lib/undo'
import { useT } from '../i18n/useT'
import './ClientStatusesModal.css'
import { Box, Txt, Btn, Input } from '../components/ui'

/* ════════════════════════════════════════════════════════════════
   ClientStatusesModal — the client sub-status editor.
   ════════════════════════════════════════════════════════════════
   Lives on the CLIENTS screen, next to the statuses it names. It used to
   live in Settings, which was the only place in the app that could create
   or delete one — the clients screen merely read them. That is why the
   settings section could not simply become a link: there was nothing at
   the other end to link to.

   It also does the thing its predecessor couldn't: RENAME. `updateClientStatus`
   had existed in the API since the table did, with no caller — so correcting
   a typo meant deleting the status (reassigning every client on it) and
   typing it again from scratch.

   Deleting still routes through DeleteSubStatusModal, which asks where the
   clients on that status should go. The composite undo below restores the
   status AND moves exactly those clients back, which a status-only undo
   could not do.

   The four meta groups are fixed by a DB check constraint — active /
   wandering / past / no_status — so they are headings, not editable rows.
   ════════════════════════════════════════════════════════════════ */

/* The four meta groups, each pointing at the label the clients screen
   already uses — "בהפסקה" and the rest are owner-decided wording, and a
   second copy here would be free to drift from the tabs above it. */
const META_LABEL = {
  active: 'status.active',
  wandering: 'status.wandering',
  past: 'status.past',
  no_status: 'status.noStatus',
}
const CLIENT_METAS = Object.keys(META_LABEL)

export default function ClientStatusesModal({ open, onClose }) {
  const { t } = useT('clients')
  const { statuses, loading, error, addStatus, updateStatus, removeStatus, refetch } = useClientStatuses()
  const { clients, refetch: refetchClients } = useClients()
  const [drafts, setDrafts] = useState({})
  const [addError, setAddError] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)  /* { status, peers } */
  /* Which row is being renamed, and the text in flight. */
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  /* Remembers exactly which clients a delete reassigned, so the undo can
     move those rows back — and only those. */
  const [reassigned, setReassigned] = useState(null)

  const setDraft = (meta, v) => setDrafts((d) => ({ ...d, [meta]: v }))

  const submitNew = async (meta) => {
    const name = (drafts[meta] || '').trim()
    if (!name) return
    try {
      await addStatus({ meta_category: meta, display_name: name, icon: null, is_default: false })
      setDraft(meta, '')
      setAddError(null)
    } catch (e) {
      setAddError(e?.message || t('statuses.addFailed'))
    }
  }

  const startEdit = (status) => { setEditId(status.id); setEditName(status.display_name) }
  const cancelEdit = () => { setEditId(null); setEditName('') }
  const commitEdit = async (status) => {
    const name = editName.trim()
    cancelEdit()
    if (!name || name === status.display_name) return
    await updateStatus(status.id, { display_name: name })
  }

  const onReassign = async (fromId, toId) => {
    const ids = (clients || []).filter((c) => c.status_id === fromId && !c.deleted_at).map((c) => c.id)
    setReassigned({ statusId: fromId, toId, ids })
    await reassignClientsStatus(fromId, toId)
  }

  const onDelete = async (statusId) => {
    await removeStatus(statusId)
    const snap = reassigned?.statusId === statusId ? reassigned : null
    setReassigned(null)
    const ids = snap?.ids || []
    const toId = snap?.toId ?? null
    /* Replaces the restore-only undo the hook just queued, adding the
       reassignment revert — otherwise undo brings the status back empty and
       leaves its clients wherever the delete dialog put them. */
    pushUndo({
      label: t('statuses.deleted'),
      undo: async () => {
        try { await restoreClientStatus(statusId) } catch { /* keep going */ }
        try { if (ids.length) await reassignClientsStatusByIds(ids, statusId) } catch { /* keep going */ }
        refetch(); refetchClients()
      },
      redo: async () => {
        try { if (ids.length) await reassignClientsStatusByIds(ids, toId) } catch { /* keep going */ }
        try { await apiRemoveStatus(statusId) } catch { /* keep going */ }
        refetch(); refetchClients()
      },
    })
    refetch(); refetchClients()
  }

  return (
    <Modal open={open} onClose={onClose} title={t('statuses.title')}>
      {/* The rename sentence is web-only: mobile's panel lists chips with a
          delete and no rename, so a shared hint would promise it something
          it doesn't do. */}
      <Txt as="p" className="m-hint">{t('statuses.hint')} {t('statuses.hintRename')}</Txt>

      {loading ? (
        <Txt as="p" className="m-hint">{t('statuses.loading')}</Txt>
      ) : error ? (
        <Txt as="p" className="m-hint" style={{ color: 'var(--clay)' }}>{error}</Txt>
      ) : (
        <Box className="cst-groups">
          {CLIENT_METAS.map((meta) => {
            const list = statuses.filter((s) => s.meta_category === meta)
            return (
              <Box key={meta} className="cst-group">
                <Txt as="p" className="cst-meta">{t(META_LABEL[meta])}</Txt>
                {list.length === 0 && <Txt as="p" className="cst-empty">{t('statuses.empty')}</Txt>}
                {list.map((s) => (
                  <Box key={s.id} className="cst-row">
                    {editId === s.id ? (
                      <>
                        <Input
                          className="m-input cst-edit-input"
                          value={editName}
                          autoFocus
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(s)
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          aria-label={t('statuses.renameAria', { name: s.display_name })}
                        />
                        <Btn type="button" className="cst-icon-btn" onClick={() => commitEdit(s)} aria-label={t('statuses.saveName')}>
                          <Check size={15} strokeWidth={2} aria-hidden="true" />
                        </Btn>
                        <Btn type="button" className="cst-icon-btn" onClick={cancelEdit} aria-label={t('statuses.cancelRename')}>
                          <X size={15} strokeWidth={2} aria-hidden="true" />
                        </Btn>
                      </>
                    ) : (
                      <>
                        {/* The name is the rename control — same gesture the
                            leads screen uses on its stage chips. */}
                        <Btn type="button" className="cst-name" onClick={() => startEdit(s)}>
                          {s.display_name}
                        </Btn>
                        <Btn
                          type="button"
                          className="cst-icon-btn cst-del"
                          onClick={() => setPendingDelete({ status: s, peers: list })}
                          aria-label={t('statuses.deleteAria', { name: s.display_name })}
                        >
                          <Trash2 size={14} strokeWidth={1.7} aria-hidden="true" />
                        </Btn>
                      </>
                    )}
                  </Box>
                ))}
                <Box className="cst-add">
                  <Input
                    className="m-input"
                    value={drafts[meta] || ''}
                    onChange={(e) => setDraft(meta, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitNew(meta) }}
                    placeholder={t('statuses.placeholder', { meta: t(META_LABEL[meta]) })}
                  />
                  <Btn
                    type="button"
                    className="mg-add-inline"
                    onClick={() => submitNew(meta)}
                    disabled={!(drafts[meta] || '').trim()}
                    aria-label={t('statuses.addAria')}
                  >
                    <Plus size={18} strokeWidth={1.8} aria-hidden="true" />
                  </Btn>
                </Box>
              </Box>
            )
          })}
        </Box>
      )}

      {addError && <Txt as="p" className="m-hint" style={{ color: 'var(--clay)' }}>{addError}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-save" onClick={onClose}>{t('statuses.close')}</Btn>
      </Box>

      <DeleteSubStatusModal
        key={pendingDelete?.status?.id || 'none'}
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        status={pendingDelete?.status}
        peers={pendingDelete?.peers || []}
        kind="client"
        onCount={countClientsByStatus}
        onReassign={onReassign}
        onDelete={onDelete}
      />
    </Modal>
  )
}
