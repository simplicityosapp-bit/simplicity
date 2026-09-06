import { useState } from 'react'
import Modal from './Modal'
import { useDiscardGuard, isDirty } from './useDiscardGuard'
import DateField from '../components/DateField'
import { newMembership } from '../lib/groupMembership'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn } from '../components/ui'

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const blank = () => ({ client_id: '', joined_at: todayStr() })

/* Add a client to a group. `availableClients` should exclude clients who are
   already members. joined_at defaults to today.

   `project` is the group's project. The picker offers every client — a
   client from a 1-on-1 project does join a workshop — but a group belongs
   to one project, so the ones from outside it are listed apart, and the
   form says before saving that the client will move in. The caller writes
   that move (see project-detail's addMemberFromModal); this form only
   says so. It used to list everyone in one undivided column and say
   nothing, and the client then sat in the group without being in the
   project. */
export default function AddGroupMemberModal({ open, onClose, onSave, onCreateClient, group, project = null, availableClients = [] }) {
  const { t } = useT('modalsClient')
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }
  /* joined_at is skipped — blank() stamps today, which is the form's own
     value and not something the user chose. */
  const guard = useDiscardGuard(isDirty(form, blank(), ['joined_at']), close)

  /* Without a project every client is "in" it — the flat list of before. */
  const inProject = project ? availableClients.filter((c) => c.project_id === project.id) : availableClients
  const elsewhere = project ? availableClients.filter((c) => c.project_id !== project.id) : []
  const picked = form.client_id ? availableClients.find((c) => c.id === form.client_id) : null
  const willMove = !!project && !!picked && picked.project_id !== project.id
  const option = (c) => <option key={c.id} value={c.id}>{c.name}</option>

  const submit = async () => {
    if (!form.client_id) { setErr(t('addGroupMember.clientRequired')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave(newMembership(
        group.id,
        form.client_id,
        /* Join date is optional — default to today when left blank. */
        new Date(form.joined_at ? `${form.joined_at}T12:00:00` : Date.now()).toISOString(),
      ))
      close()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  return (
    <Modal open={open} onClose={guard.requestClose} onSubmit={submit} title={t('addGroupMember.title')}>
      {group && (
        <Txt as="p" className="m-sub">
          <Txt className="m-sub-dot" style={{ background: group.color || 'var(--stone)' }} />
          {group.name}
        </Txt>
      )}
      <Box className="m-field">
        <Box className="m-label-row">
          <Box as="label" className="m-label">{t('addGroupMember.client')}</Box>
          {/* Someone who walked in today is not on the list yet, and putting
              them in a group took two separate trips: add the client to the
              project, close, reopen this, find them. The link creates them
              and drops them straight into this group. */}
          {onCreateClient && (
            <Btn type="button" className="m-clear-link" onClick={onCreateClient}>
              {t('addGroupMember.newClient')}
            </Btn>
          )}
        </Box>
        {availableClients.length ? (
          <select className="m-select" value={form.client_id} onChange={(e) => { set('client_id', e.target.value); if (err) setErr('') }}>
            <option value="">{t('addGroupMember.selectClient')}</option>
            {/* Two groups only once there is something to tell apart; a
                project whose every client is its own gets the plain list. */}
            {elsewhere.length ? (
              <>
                {inProject.length > 0 && (
                  <optgroup label={t('addGroupMember.inProject')}>{inProject.map(option)}</optgroup>
                )}
                <optgroup label={t('addGroupMember.elsewhere')}>{elsewhere.map(option)}</optgroup>
              </>
            ) : inProject.map(option)}
          </select>
        ) : (
          /* Not an error: everyone the coach has is already in this group,
             which is a fine state to be in. It reads as one because there
             was nothing else to do here — now there is. */
          <Txt as="p" className="m-hint">{t('addGroupMember.allMembers')}</Txt>
        )}
        {willMove && (
          <Txt as="p" className="m-hint">{t('addGroupMember.movesToProject', { project: project.name })}</Txt>
        )}
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('addGroupMember.joinDateOptional')}</Box>
        <DateField value={form.joined_at} onChange={(e) => set('joined_at', e.target.value)} />
      </Box>

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={guard.requestClose}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy || !availableClients.length}>{busy ? t('common.saving') : t('addGroupMember.addAction')}</Btn>
      </Box>
      {guard.confirm}
    </Modal>
  )
}
