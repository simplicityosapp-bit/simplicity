import { useState } from 'react'
import Modal from './Modal'
import DateField from '../components/DateField'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn } from '../components/ui'

const todayStr = () => new Date().toISOString().slice(0, 10)
const blank = () => ({ client_id: '', joined_at: todayStr() })

/* Add a client to a group. `availableClients` should exclude clients who are
   already members. joined_at defaults to today. */
export default function AddGroupMemberModal({ open, onClose, onSave, group, availableClients = [] }) {
  const { t } = useT('modalsClient')
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    if (!form.client_id) { setErr(t('addGroupMember.clientRequired')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({
        group_id: group.id,
        client_id: form.client_id,
        /* Join date is optional — default to today when left blank. */
        joined_at: new Date(form.joined_at ? `${form.joined_at}T12:00:00` : Date.now()).toISOString(),
        left_at: null,
        total_override: null,
        has_custom_price: false,
        package_sessions_override: null,
        left_mid_process: false,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  return (
    <Modal open={open} onClose={close} title={t('addGroupMember.title')}>
      {group && (
        <Txt as="p" className="m-sub">
          <Txt className="m-sub-dot" style={{ background: group.color || 'var(--stone)' }} />
          {group.name}
        </Txt>
      )}
      <Box className="m-field">
        <Box as="label" className="m-label">{t('addGroupMember.client')}</Box>
        {availableClients.length ? (
          <select className="m-select" value={form.client_id} onChange={(e) => { set('client_id', e.target.value); if (err) setErr('') }}>
            <option value="">{t('addGroupMember.selectClient')}</option>
            {availableClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : (
          <Txt as="p" className="m-error">{t('addGroupMember.allMembers')}</Txt>
        )}
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('addGroupMember.joinDateOptional')}</Box>
        <DateField value={form.joined_at} onChange={(e) => set('joined_at', e.target.value)} />
      </Box>

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={close}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy || !availableClients.length}>{busy ? t('common.saving') : t('addGroupMember.addAction')}</Btn>
      </Box>
    </Modal>
  )
}
