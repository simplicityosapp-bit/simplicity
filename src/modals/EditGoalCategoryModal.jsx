import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import Modal from './Modal'
import { useT } from '../i18n/useT'
import { CATEGORY_SWATCHES as COLORS } from '../lib/palette'
import { Box, Txt, Btn, Input } from '../components/ui'

const ICONS = ['💰', '🤝', '🌱', '✨', '🎨', '🏃', '📚', '🧘', '✍️', '💡', '⭐']

/* Edit a category's name / icon / color (cosmetic, safe for both auto and
   manual). Measurement type / data source aren't editable — they're fixed by
   the preset. Delete removes the category (and its goals, handled by caller).
   The parent passes key={category.id} so this remounts per category. */
export default function EditGoalCategoryModal({ open, onClose, category, onSave, onDelete }) {
  const { t } = useT('modalsData')
  const [form, setForm] = useState(() => ({
    name: category?.name || '',
    icon: category?.icon || ICONS[0],
    color: category?.color || COLORS[0],
  }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  if (!category) return <Modal open={open} onClose={onClose} title={t('editCat.title')} />

  const submit = async () => {
    if (!form.name.trim()) { setErr(t('common.nameRequired')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave(category.id, { name: form.name.trim(), icon: form.icon, color: form.color })
      onClose()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  const icons = category.icon && !ICONS.includes(category.icon) ? [category.icon, ...ICONS] : ICONS

  return (
    <Modal open={open} onClose={onClose} title={t('editCat.title')}>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('editCat.metricName')}</Box>
        <Input
          className={`m-input${err && !form.name.trim() ? ' err' : ''}`}
          value={form.name}
          onChange={(e) => { set('name', e.target.value); if (err) setErr('') }}
          placeholder={t('editCat.namePlaceholder')}
        />
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('common.icon')}</Box>
        <Box className="m-pills">
          {icons.map((ic) => (
            <Btn key={ic} type="button" className={`m-pill${form.icon === ic ? ' on' : ''}`} onClick={() => set('icon', ic)}>{ic}</Btn>
          ))}
        </Box>
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('common.color')}</Box>
        <Box className="m-colors">
          {COLORS.map((c) => (
            <Btn key={c} type="button" className={`m-color${form.color === c ? ' on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => set('color', c)} />
          ))}
        </Box>
      </Box>

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={onClose}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</Btn>
      </Box>
      <Btn type="button" className="m-btn-delete" onClick={() => onDelete(category)}>
        <Trash2 size={15} strokeWidth={1.7} aria-hidden="true" /> {t('editCat.deleteMetric')}
      </Btn>
    </Modal>
  )
}
