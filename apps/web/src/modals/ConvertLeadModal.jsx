import { useState } from 'react'
import SelectMenu from '../components/SelectMenu'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'
import { showToast } from '../lib/toast'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input } from '../components/ui'

/* Convert a lead → client. The lead's name/phone seed the form; the
   user can adjust and pick a project. On save:
     1. insert a new client (status='active', no sessions/price yet)
     2. update the lead — status_meta='converted', converted_at=now,
        converted_to_client_id=newClient.id, last_status_changed_at=now,
        with source='converted' so the lead_status_log captures it.
   The parent wires onCreateClient + onUpdateLead so the modal stays
   adapter-agnostic. */
export default function ConvertLeadModal({ open, onClose, lead, projects = [], groups = [], onCreateClient, onUpdateLead, onAddGroupMember }) {
  const { t } = useT('modalsClient')
  const { t: ts } = useT('modalsSystem') // shared modal chrome (discard prompt)
  const [form, setForm] = useState(() => ({
    name: lead?.name || '',
    phone: lead?.phone || '',
    project_id: lead?.project_id || '',
    group_id: lead?.group_id || '',
  }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  /* Escape / the overlay / the X threw the adjusted client details away
     without a word. An untouched form still closes on one tap. */
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  /* Changing the project clears the group — a group only belongs to its project. */
  const setProject = (v) => setForm((f) => ({ ...f, project_id: v, group_id: '' }))

  /* Seeded from the lead, so only edits the user made here count as dirty. */
  const formDirty = !lead ? false : (
    form.name !== (lead.name || '')
    || form.phone !== (lead.phone || '')
    || form.project_id !== (lead.project_id || '')
    || form.group_id !== (lead.group_id || '')
  )
  /* The single exit for Escape, the overlay and the X. */
  const requestClose = () => { if (formDirty) setConfirmDiscard(true); else onClose() }

  if (!lead) return <Modal open={open} onClose={onClose} title={t('convertLead.title')} />

  /* Groups belonging to the chosen project — drives the conditional picker. */
  const projectGroups = form.project_id
    ? groups.filter((g) => g.project_id === form.project_id && !g.deleted_at)
    : []

  /* Same option shapes as the other lead modals. */
  const projectOptions = [{ value: '', label: t('common.none') }, ...projects.map((p) => ({ value: p.id, label: p.name }))]
  const groupOptions = [{ value: '', label: t('common.none') }, ...projectGroups.map((g) => ({ value: g.id, label: g.name }))]

  const submit = async () => {
    if (!form.name.trim()) { setErr(t('convertLead.nameRequired')); return }
    setBusy(true)
    setErr('')
    const now = new Date().toISOString()
    try {
      /* Step 1 — create the client. */
      const newClient = await onCreateClient({
        name: form.name.trim(),
        status: 'active',
        status_meta: 'active',
        status_id: null,
        project_id: form.project_id || null,
        group_id: form.group_id || null,
        sessions: 0,
        price_per_session: 0,
        total_override: null,
        has_custom_price: false,
        recurring_day: null,
        recurring_time: null,
        left_mid_process: false,
        phone: form.phone.trim() || null,
        notes: lead.notes || null,
        notes_updated_at: lead.notes ? now : null,
      })

      /* Step 1b — group membership is a real group_members row, NOT just the
         clients.group_id mirror. Setting group_id alone left the client only
         "half" in the group (visible via the legacy mirror, but absent from
         the roster + per-member billing). Create the membership too, exactly
         like assignToGroup in project-detail. */
      if (form.group_id && onAddGroupMember) {
        await onAddGroupMember({
          group_id: form.group_id,
          client_id: newClient.id,
          joined_at: now,
          left_at: null,
          total_override: null,
          has_custom_price: false,
          package_sessions_override: null,
          left_mid_process: false,
        }).catch(() => {}) /* best-effort, like assignToGroup — never block the conversion */
      }

      /* Step 2 — flip the lead to 'converted' and stamp the link.
         Pass source='converted' so the log row labels the transition
         correctly.

         status_id is cleared, not chosen: a closed lead is described by the
         project it joined, which the picker above already collects — asking
         for a sub-status on top of it was the one field coaches queried
         (owner's call). updateLead writes a log row only when there IS a
         to_status_id, so this simply opens no row; converted_at + the
         client link are what the funnel actually reads. */
      await onUpdateLead(
        lead.id,
        {
          status_meta: 'converted',
          status_id: null,
          converted_at: now,
          converted_to_client_id: newClient.id,
          last_status_changed_at: now,
        },
        { source: 'converted' },
      )
      showToast(t('convertLead.toastCreated'))
      onClose()
    } catch (e) {
      setBusy(false)
      setErr(t('convertLead.convertFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  return (
    <Modal open={open} onClose={requestClose} title={t('convertLead.title')}>
      <Txt as="p" className="m-sub">
        <Txt className="m-sub-dot" style={{ background: 'var(--sage)' }} />
        {lead.name}
      </Txt>

      <Box className="m-field">
        <Box as="label" className="m-label">{t('convertLead.clientName')}</Box>
        <Input
          className={`m-input${err && !form.name.trim() ? ' err' : ''}`}
          value={form.name}
          onChange={(e) => { set('name', e.target.value); if (err) setErr('') }}
        />
      </Box>

      <Box className="m-row2">
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.phone')}</Box>
          <Input className="m-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder={t('common.phonePlaceholder')} />
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.projectOptional')}</Box>
          <SelectMenu value={form.project_id} onChange={setProject} options={projectOptions} placeholder={t('common.none')} ariaLabel={t('common.projectOptional')} />
        </Box>
      </Box>

      {projectGroups.length > 0 && (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.groupOptional')}</Box>
          <SelectMenu value={form.group_id} onChange={(v) => set('group_id', v)} options={groupOptions} placeholder={t('common.none')} ariaLabel={t('common.groupOptional')} />
        </Box>
      )}

      <Txt as="p" className="m-hint">{t('convertLead.footHint')}</Txt>

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={requestClose} disabled={busy}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('convertLead.converting') : t('convertLead.convert')}</Btn>
      </Box>

      <ConfirmModal
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title={ts('discard.title')}
        message={ts('discard.message')}
        confirmLabel={ts('discard.confirm')}
        cancelLabel={ts('discard.cancel')}
        danger
        onConfirm={() => { setConfirmDiscard(false); onClose() }}
      />
    </Modal>
  )
}
