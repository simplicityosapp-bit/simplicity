import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import DateField from '../components/DateField'
import SelectMenu from '../components/SelectMenu'
import FormSection from '../components/FormSection'
import Modal from './Modal'
import { useDiscardGuard, isDirty, useScrollToError, useFormDraft } from './useDiscardGuard'
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
  /* The optional half of the form. Closed unless something inside it is
     already filled by a caller-supplied default. */
  const [detailsOpen, setDetailsOpen] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  /* Changing the project clears the group — a group only makes sense
     inside the project it belongs to. */
  const setProject = (v) => setForm((f) => ({ ...f, project_id: v, group_id: '' }))
  const close = () => {
    setForm(blank()); setErr(''); setBusy(false)
    setCreatingSource(false); setNewSourceName(''); setSourceBusy(false)
    setDetailsOpen(false)
    onClose()
  }

  /* Escape / the overlay / the X threw a filled-in enquiry away without a
     word. They ask first now — but only when something was actually typed,
     so opening the form by mistake still closes on one tap.
     inquiry_date is NOT skipped: blank() stamps it with today, so a value
     different from that one is a date the user chose. A half-typed new
     source name counts as work too. */
  /* Survives a refresh mid-form. inquiry_date is stamped with today by
     blank(), so a draft written yesterday restores yesterday's date — but
     sessionStorage means "a draft written yesterday" cannot outlive the tab,
     and the date is on screen and editable either way. */
  const draft = useFormDraft({ name: 'lead', form, setForm, blank: blank(), enabled: open })
  const guard = useDiscardGuard(
    isDirty(form, blank()) || newSourceName.trim() !== '',
    () => { draft.clear(); close() },
  )
  const requestClose = guard.requestClose
  /* A rejected save should put the field it rejected back on screen. */
  useScrollToError(err)

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
      draft.clear()
      close()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  const nameMissing = !!err && !form.name.trim()

  /* Option lists for the styled pickers — same shapes the transaction modals
     build, so every form in the app opens the identical menu instead of a
     styled one here and an OS-native list there. */
  const inProcessStatuses = statuses.filter((s) => s.meta_category === 'in_process')
  const sourceOptions = [
    { value: '', label: t('common.none') },
    ...sources.map((s) => ({ value: s.id, label: s.name })),
    ...(onAddSource ? [{ value: '__new__', label: t('common.newSourceOption'), accent: true }] : []),
  ]
  const projectOptions = [{ value: '', label: t('common.none') }, ...projects.map((p) => ({ value: p.id, label: p.name }))]
  const groupOptions = [{ value: '', label: t('common.none') }, ...projectGroups.map((g) => ({ value: g.id, label: g.name }))]
  const statusOptions = [
    { value: '', label: t('common.none') },
    ...inProcessStatuses.map((s) => ({ value: s.id, label: `${s.icon ? `${s.icon} ` : ''}${s.display_name}` })),
  ]

  return (
    <Modal open={open} onClose={requestClose} onSubmit={submit} title={t('addLead.title')}>
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
          <SelectMenu
            value={form.source_id}
            onChange={(v) => { if (v === '__new__') { setCreatingSource(true); return } set('source_id', v) }}
            options={sourceOptions}
            placeholder={t('common.none')}
            ariaLabel={t('common.source')}
          />
        )}
      </Box>
      {/* "התקשרה דנה" is a name, a phone and where she came from. The other six
          fields fold away, and open by themselves whenever the follow-up date
          is set (the one an existing lead is most often created with) or any
          other is already filled — a value behind a closed lid is worse than
          no lid at all. */}
      <FormSection
        id="lead-details"
        icon={<SlidersHorizontal size={16} strokeWidth={1.7} />}
        title={t('addLead.moreDetails')}
        open={detailsOpen}
        onToggle={() => setDetailsOpen((o) => !o)}
      >
            <Box className="m-field">
              <Box as="label" className="m-label">{t('common.projectOptional')}</Box>
              <SelectMenu value={form.project_id} onChange={setProject} options={projectOptions} placeholder={t('common.none')} ariaLabel={t('common.projectOptional')} />
            </Box>
            {projectGroups.length > 0 && (
              <Box className="m-field">
                <Box as="label" className="m-label">{t('common.groupOptional')}</Box>
                <SelectMenu value={form.group_id} onChange={(v) => set('group_id', v)} options={groupOptions} placeholder={t('common.none')} ariaLabel={t('common.groupOptional')} />
              </Box>
            )}
            {inProcessStatuses.length > 0 && (
              <Box className="m-field">
                {/* A new lead always lands in "בתהליך", so the field is
                    always a stage here — never a not-relevant reason. */}
                <Box as="label" className="m-label">{t('common.leadStageOptional', { context: 'in_process' })}</Box>
                <SelectMenu value={form.status_id} onChange={(v) => set('status_id', v)} options={statusOptions} placeholder={t('common.none')} ariaLabel={t('common.leadStageOptional', { context: 'in_process' })} />
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
      </FormSection>

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={requestClose}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</Btn>
      </Box>

      {guard.confirm}
    </Modal>
  )
}
