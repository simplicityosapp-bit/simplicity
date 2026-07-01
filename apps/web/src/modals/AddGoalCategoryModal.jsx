import { useState } from 'react'
import Modal from './Modal'
import { useT } from '../i18n/useT'
import { CATEGORY_SWATCHES as COLORS } from '../lib/palette'
import { Box, Txt, Btn, Input } from '../components/ui'

const ICONS = ['🎨', '🏃', '📚', '🧘', '✍️', '🌱', '💡', '⭐']
const blank = () => ({ name: '', icon: ICONS[0], color: COLORS[0] })

/* Custom (manual) goal category — name + icon + color. Auto categories (income
   etc.) are added as one-tap presets, not here. graph_type defaults to 'delta'. */
export default function AddGoalCategoryModal({ open, onClose, onSave }) {
  const { t } = useT('modalsData')
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    if (!form.name.trim()) { setErr(t('common.nameRequired')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({
        key: null,
        name: form.name.trim(),
        icon: form.icon,
        color: form.color,
        measurement_type: 'manual',
        data_source: null,
        graph_type: 'delta',
        builtin: false,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  return (
    <Modal open={open} onClose={close} title={t('addCat.title')}>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('addCat.metricName')}</Box>
        <Input
          className={`m-input${err && !form.name.trim() ? ' err' : ''}`}
          value={form.name}
          onChange={(e) => { set('name', e.target.value); if (err) setErr('') }}
          placeholder={t('addCat.namePlaceholder')}
        />
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('common.icon')}</Box>
        <Box className="m-pills">
          {ICONS.map((ic) => (
            <Btn key={ic} type="button" className={`m-pill${form.icon === ic ? ' on' : ''}`} onClick={() => set('icon', ic)}>{ic}</Btn>
          ))}
        </Box>
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
              onClick={() => set('color', c)}
            />
          ))}
        </Box>
      </Box>

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={close}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</Btn>
      </Box>
    </Modal>
  )
}
