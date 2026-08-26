import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import Modal from './Modal'
import { useDiscardGuard, isDirty } from './useDiscardGuard'
import { useT } from '../i18n/useT'
import { CATEGORY_SWATCHES as COLORS, swatchKey } from '../lib/palette'
import { Box, Txt, Btn, Input } from '../components/ui'

/* Edit a project — name + color.
   `onDelete(project)` is optional, exactly as in EditGroupModal: supplied only
   where the caller owns a delete. It hands the project back rather than
   deleting here, so the caller keeps its own confirm dialog and undo toast.
   Added because the project screen had no way to delete at all — you had to
   navigate back to the list and find the card — while the mobile twin and
   every group already offered it from inside. */
export default function EditProjectModal({ open, onClose, onSave, onDelete, project }) {
  const { t } = useT('modalsData')
  const { t: tc } = useT('common')
  const [form, setForm] = useState(() => ({
    name: project?.name || '',
    color: project?.color || COLORS[0],
    /* Rows created before migration 0111 have no status; they are active. */
    status: project?.status || 'active',
  }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  /* Pristine = the project as it stands, so only the user's OWN edits count as
     dirty. Declared before the early return below — a hook cannot sit after a
     conditional return, and `project` being absent simply makes it not dirty. */
  const pristine = {
    name: project?.name || '',
    color: project?.color || COLORS[0],
    status: project?.status || 'active',
  }
  const guard = useDiscardGuard(!!project && isDirty(form, pristine), onClose)

  if (!project) return <Modal open={open} onClose={onClose} title={t('editProject.title')} />

  const submit = async () => {
    if (!form.name.trim()) { setErr(t('common.nameRequired')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave(project.id, { name: form.name.trim(), color: form.color, status: form.status })
      onClose()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  return (
    <Modal open={open} onClose={guard.requestClose} onSubmit={submit} title={t('editProject.title')}>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('editProject.projectName')}</Box>
        <Input
          className={`m-input${err && !form.name.trim() ? ' err' : ''}`}
          value={form.name}
          onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); if (err) setErr('') }}
        />
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('common.color')}</Box>
        <Box className="m-colors">
          {COLORS.map((c) => (
            <Btn
              key={c}
              type="button"
              className={`m-color${form.color === c ? ' on' : ''}`}
              style={{ background: c }}
              aria-label={tc(`colorNames.${swatchKey(c)}`, { defaultValue: c })}
              onClick={() => setForm((f) => ({ ...f, color: c }))}
            />
          ))}
        </Box>
      </Box>

      {/* Two states only. A project is running or it is done — "בפיתוח" is a
          group-cohort idea and does not apply here. Ending a project files it
          out of the list; it never touches the project's clients (the group
          status cascade is a different thing on purpose — see migration 0111). */}
      <Box className="m-field">
        <Box as="label" className="m-label">{t('editProject.status')}</Box>
        <Box className="m-pills">
          <Btn
            type="button"
            className={`m-pill${form.status === 'active' ? ' on' : ''}`}
            onClick={() => setForm((f) => ({ ...f, status: 'active' }))}
          >
            {t('editProject.statusActive')}
          </Btn>
          <Btn
            type="button"
            className={`m-pill${form.status === 'ended' ? ' on' : ''}`}
            onClick={() => setForm((f) => ({ ...f, status: 'ended' }))}
          >
            {t('editProject.statusEnded')}
          </Btn>
        </Box>
        {form.status === 'ended' && (
          <Txt as="p" className="m-hint">{t('editProject.statusEndedHint')}</Txt>
        )}
      </Box>

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={guard.requestClose}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</Btn>
      </Box>
      {onDelete && (
        <Btn type="button" className="m-btn-delete" onClick={() => onDelete(project)}>
          <Trash2 size={15} strokeWidth={1.7} aria-hidden="true" /> {t('editProject.deleteProject')}
        </Btn>
      )}
      {guard.confirm}
    </Modal>
  )
}
