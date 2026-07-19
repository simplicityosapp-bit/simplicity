import { useState } from 'react'
import DateField from '../components/DateField'
import Modal from './Modal'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input, Textarea } from '../components/ui'

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const blank = () => ({ name: '', phone: '', source_id: '', project_id: '', group_id: '', status_id: '', inquiry_date: todayStr(), follow_up_date: '', notes: '' })

/* onSave is async (Supabase insert). New leads land in the "בתהליך" column;
   the user can optionally pick a sub-status, tie the lead to a project, and —
   when that project has groups — to a specific group. onAddSource (optional)
   enables inline source creation so the user never leaves the modal. */
export default function AddLeadModal({ open, onClose, onSave, sources = [], statuses = [], projects = [], groups = [], onAddSource }) {
  const { t } = useT('modalsClient')
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [creatingSource, setCreatingSource] = useState(false)
  const [newSourceName, setNewSourceName] = useState('')
  const [sourceBusy, setSourceBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  /* Changing the project clears the group — a group only makes sense
     inside the project it belongs to. */
  const setProject = (v) => setForm((f) => ({ ...f, project_id: v, group_id: '' }))
  const close = () => {
    setForm(blank()); setErr(''); setBusy(false)
    setCreatingSource(false); setNewSourceName(''); setSourceBusy(false)
    onClose()
  }

  /* Groups belonging to the chosen project — drives the conditional picker. */
  const projectGroups = form.project_id
    ? groups.filter((g) => g.project_id === form.project_id && !g.deleted_at)
    : []

  /* Inline "new source" creation — mirrors the inline category flow in the
     transaction modal. Creating one selects it immediately. */
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
    if (!form.name.trim()) { setErr(t('addLead.nameRequired')); return }
    setBusy(true)
    setErr('')
    const now = new Date().toISOString()
    try {
      await onSave({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        source_id: form.source_id || null,
        project_id: form.project_id || null,
        group_id: form.group_id || null,
        status: 'new',
        status_id: form.status_id || null,
        status_meta: 'in_process',
        inquiry_date: form.inquiry_date,
        follow_up_date: form.follow_up_date || null,
        last_status_changed_at: now,
        notes: form.notes.trim() || null,
        converted_to_client_id: null,
        converted_at: null,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  const nameMissing = !!err && !form.name.trim()

  return (
    <Modal open={open} onClose={close} title={t('addLead.title')}>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('common.name')}</Box>
        <Input
          className={`m-input${nameMissing ? ' err' : ''}`}
          value={form.name}
          onChange={(e) => { set('name', e.target.value); if (err) setErr('') }}
          placeholder={t('addLead.namePlaceholder')}
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
      {statuses.filter((s) => s.meta_category === 'in_process').length > 0 && (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.subStatusOptional')}</Box>
          <select className="m-select" value={form.status_id} onChange={(e) => set('status_id', e.target.value)}>
            <option value="">{t('common.none')}</option>
            {statuses.filter((s) => s.meta_category === 'in_process').map((s) => (
              <option key={s.id} value={s.id}>{s.icon ? s.icon + ' ' : ''}{s.display_name}</option>
            ))}
          </select>
        </Box>
      )}
      <Box className="m-row2">
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.inquiryDate')}</Box>
          <DateField value={form.inquiry_date} onChange={(e) => set('inquiry_date', e.target.value)} />
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.followUp')}</Box>
          <DateField value={form.follow_up_date} onChange={(e) => set('follow_up_date', e.target.value)} />
        </Box>
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('common.notes')}</Box>
        <Textarea className="m-textarea" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder={t('common.leadNotesPlaceholder')} />
      </Box>

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={close}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</Btn>
      </Box>
    </Modal>
  )
}
