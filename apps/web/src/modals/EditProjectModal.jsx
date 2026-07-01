import { useState } from 'react'
import Modal from './Modal'
import { useT } from '../i18n/useT'
import { CATEGORY_SWATCHES as COLORS } from '../lib/palette'
import { Box, Txt, Btn, Input } from '../components/ui'

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
              aria-label={c}
              onClick={() => setForm((f) => ({ ...f, color: c }))}
            />
          ))}
        </Box>
      </Box>

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={onClose}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</Btn>
      </Box>
    </Modal>
  )
}
