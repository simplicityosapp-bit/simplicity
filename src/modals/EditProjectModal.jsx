import { useState } from 'react'
import Modal from './Modal'
import { useT } from '../i18n/useT'
import { CATEGORY_SWATCHES as COLORS } from '../lib/palette'

/* Edit a project — name + color. */
export default function EditProjectModal({ open, onClose, onSave, project }) {
  const { t } = useT('modalsData')
  const [form, setForm] = useState(() => ({
    name: project?.name || '',
    color: project?.color || COLORS[0],
  }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (!project) return <Modal open={open} onClose={onClose} title={t('editProject.title')} />

  const submit = async () => {
    if (!form.name.trim()) { setErr(t('common.nameRequired')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave(project.id, { name: form.name.trim(), color: form.color })
      onClose()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('editProject.title')}>
      <div className="m-field">
        <label className="m-label">{t('editProject.projectName')}</label>
        <input
          className={`m-input${err && !form.name.trim() ? ' err' : ''}`}
          value={form.name}
          onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); if (err) setErr('') }}
        />
      </div>
      <div className="m-field">
        <label className="m-label">{t('common.color')}</label>
        <div className="m-colors">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`m-color${form.color === c ? ' on' : ''}`}
              style={{ background: c }}
              aria-label={c}
              onClick={() => setForm((f) => ({ ...f, color: c }))}
            />
          ))}
        </div>
      </div>

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
      </div>
    </Modal>
  )
}
