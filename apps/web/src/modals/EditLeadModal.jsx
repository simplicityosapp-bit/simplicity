import { useState } from 'react'
import DateField from '../components/DateField'
import Modal from './Modal'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input, Textarea } from '../components/ui'

const METAS = [
  { k: 'in_process', l: 'metaInProcess' },
  { k: 'converted', l: 'metaConverted' },
  { k: 'not_relevant', l: 'metaNotRelevant' },
]

/* Edit a lead — name / phone / source / project / group / dates / notes /
   kanban column (status_meta) / sub-status. The group picker appears only
   when the chosen project has groups. onAddSource (optional) enables inline
   source creation. */
export default function EditLeadModal({ open, onClose, onSave, lead, statuses = [], sources = [], projects = [], groups = [], onAddSource }) {
  const { t } = useT('modalsClient')
  const [form, setForm] = useState(() => ({
    name: lead?.name || '',
    phone: lead?.phone || '',
    source_id: lead?.source_id || '',
    project_id: lead?.project_id || '',
    group_id: lead?.group_id || '',
    inquiry_date: lead?.inquiry_date || '',
    follow_up_date: lead?.follow_up_date || '',
    notes: lead?.notes || '',
    status_meta: lead?.status_meta || 'in_process',
    status_id: lead?.status_id || '',
  }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [creatingSource, setCreatingSource] = useState(false)
  const [newSourceName, setNewSourceName] = useState('')
  const [sourceBusy, setSourceBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const setMeta = (k) => setForm((f) => ({ ...f, status_meta: k, status_id: '' }))
  /* Changing the project clears the group — a group only belongs to its project. */
  const setProject = (v) => setForm((f) => ({ ...f, project_id: v, group_id: '' }))

  if (!lead) return <Modal open={open} onClose={onClose} title={t('editLead.title')} />
  const subStatuses = statuses.filter((s) => s.meta_category === form.status_meta)
  const projectGroups = form.project_id
    ? groups.filter((g) => g.project_id === form.project_id && !g.deleted_at)
    : []

  const createSource = async () => {
    const name = newSourceName.trim()
    if (!name || !onAddSource) return
    setSourceBusy(true)
    try {
      const row = await onAddSource(name)
      if (row?.id) set('source_id', row.id)
      setCreatingSource(false)
      setNewSourceName('')
    } catch {
      /* leave the field open so the user can retry */
    } finally {
      setSourceBusy(false)
    }
  }

  const submit = async () => {
    if (!form.name.trim()) { setErr(t('common.nameRequired')); return }
    setBusy(true)
    setErr('')
    const wasConverted = lead.status_meta === 'converted'
    const nowConverted = form.status_meta === 'converted'
    const now = new Date().toISOString()
    try {
      await onSave(lead.id, {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        source_id: form.source_id || null,
        project_id: form.project_id || null,
        group_id: form.group_id || null,
        inquiry_date: form.inquiry_date || null,
        follow_up_date: form.follow_up_date || null,
        notes: form.notes.trim() || null,
        status_meta: form.status_meta,
        status_id: form.status_id || null,
        last_status_changed_at: form.status_meta !== lead.status_meta ? now : lead.last_status_changed_at,
        converted_at: nowConverted && !wasConverted ? now : (nowConverted ? lead.converted_at : null),
        /* Clear the client link when un-converting, mirroring the kanban drag
           path (applyLeadMove) — otherwise a dangling converted_to_client_id
           lingers after the lead is moved back out of "converted". */
        converted_to_client_id: nowConverted ? lead.converted_to_client_id : null,
      })
      onClose()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('editLead.title')}>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('common.name')}</Box>
        <Input
          className={`m-input${err && !form.name.trim() ? ' err' : ''}`}
          value={form.name}
          onChange={(e) => { set('name', e.target.value); if (err) setErr('') }}
        />
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('common.phone')}</Box>
        <Input className="m-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder={t('common.phonePlaceholder')} />
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('common.source')}</Box>
        {creatingSource ? (
          <Box className="m-cat-create">
            <Input
              className="m-input"
              value={newSourceName}
              onChange={(e) => setNewSourceName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createSource() } }}
              placeholder={t('common.newSourceName')}
              autoFocus
            />
            <Btn type="button" className="m-cat-add" onClick={createSource} disabled={sourceBusy || !newSourceName.trim()}>
              {sourceBusy ? '…' : t('common.add')}
            </Btn>
            <Btn type="button" className="m-cat-cancel" onClick={() => { setCreatingSource(false); setNewSourceName('') }}>
              {t('common.cancel')}
            </Btn>
          </Box>
        ) : (
          <select
            className="m-select"
            value={form.source_id}
            onChange={(e) => {
              if (e.target.value === '__new__') { setCreatingSource(true); return }
              set('source_id', e.target.value)
            }}
          >
            <option value="">{t('common.none')}</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            {onAddSource && <option value="__new__">{t('common.newSourceOption')}</option>}
          </select>
        )}
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('common.projectOptional')}</Box>
        <select className="m-select" value={form.project_id} onChange={(e) => setProject(e.target.value)}>
          <option value="">{t('common.none')}</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Box>
      {projectGroups.length > 0 && (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.groupOptional')}</Box>
          <select className="m-select" value={form.group_id} onChange={(e) => set('group_id', e.target.value)}>
            <option value="">{t('common.none')}</option>
            {projectGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Box>
      )}
      <Box className="m-row2">
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.inquiryDate')}</Box>
          <DateField value={form.inquiry_date || ''} onChange={(e) => set('inquiry_date', e.target.value)} />
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.followUp')}</Box>
          <DateField value={form.follow_up_date || ''} onChange={(e) => set('follow_up_date', e.target.value)} />
        </Box>
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('editLead.status')}</Box>
        <Box className="m-pills">
          {METAS.map((m) => (
            <Btn key={m.k} type="button" className={`m-pill${form.status_meta === m.k ? ' on' : ''}`} onClick={() => setMeta(m.k)}>{t(`editLead.${m.l}`)}</Btn>
          ))}
        </Box>
      </Box>
      {subStatuses.length > 0 && (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.subStatusOptional')}</Box>
          <select className="m-select" value={form.status_id} onChange={(e) => set('status_id', e.target.value)}>
            <option value="">{t('common.none')}</option>
            {subStatuses.map((s) => <option key={s.id} value={s.id}>{s.icon ? s.icon + ' ' : ''}{s.display_name}</option>)}
          </select>
        </Box>
      )}
      <Box className="m-field">
        <Box as="label" className="m-label">{t('common.notes')}</Box>
        <Textarea className="m-textarea" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder={t('common.leadNotesPlaceholder')} />
      </Box>

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={onClose}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</Btn>
      </Box>
    </Modal>
  )
}
