import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import Modal from './Modal'
import DateField from '../components/DateField'
import { GROUP_BILLING_MODES } from '@simplicity/core'
import { useT } from '../i18n/useT'
import { CATEGORY_SWATCHES as COLORS } from '../lib/palette'
import { Box, Txt, Btn, Input } from '../components/ui'

const DAYS = [0, 1, 2, 3, 4, 5, 6]

export default function EditGroupModal({ open, onClose, onSave, onDelete, group }) {
  const { t } = useT('modalsClient')
  const [form, setForm] = useState(() => ({
    name: group?.name || '',
    color: group?.color || COLORS[0],
    billing_mode: group?.billing_mode || 'package',
    package_price: group?.package_price ?? '',
    package_sessions: group?.package_sessions ?? '',
    price_per_session: group?.price_per_session ?? '',
    recurring_day: group?.recurring_day == null ? '' : String(group.recurring_day),
    recurring_time: group?.recurring_time || '',
    recurring_end_time: group?.recurring_end_time || '',
    recurring_start_date: group?.recurring_start_date || '',
    recurring_end_date: group?.recurring_end_date || '',
  }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  if (!group) return <Modal open={open} onClose={onClose} title={t('editGroup.title')} />

  const submit = async () => {
    if (!form.name.trim()) { setErr(t('common.nameRequired')); return }
    const mode = form.billing_mode
    const price = parseFloat(form.package_price)
    const sess = parseInt(form.package_sessions, 10)
    const perSession = parseFloat(form.price_per_session)
    if (mode === 'package') {
      if (!(price > 0)) { setErr(t('editGroup.errPackagePrice')); return }
      if (!(sess > 0)) { setErr(t('editGroup.errSessions')); return }
    } else if (mode === 'per_session') {
      if (!(perSession > 0)) { setErr(t('editGroup.errPerSession')); return }
    }
    setBusy(true)
    setErr('')
    try {
      await onSave(group.id, {
        name: form.name.trim(),
        color: form.color,
        billing_mode: mode,
        package_price: mode === 'package' ? price : null,
        package_sessions: mode === 'package' ? sess : null,
        price_per_session: mode === 'per_session' ? perSession : null,
        recurring_day: form.recurring_day === '' ? null : Number(form.recurring_day),
        recurring_time: form.recurring_time || null,
        recurring_end_time: form.recurring_end_time || null,
        recurring_start_date: form.recurring_start_date || null,
        recurring_end_date: form.recurring_end_date || null,
      })
      onClose()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('editGroup.title')}>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('editGroup.groupName')}</Box>
        <Input
          className={`m-input${err && !form.name.trim() ? ' err' : ''}`}
          value={form.name}
          onChange={(e) => { set('name', e.target.value); if (err) setErr('') }}
        />
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('editGroup.pricing')}</Box>
        <Box className="m-pills">
          {GROUP_BILLING_MODES.map((mode) => (
            <Btn
              key={mode}
              type="button"
              className={`m-pill${form.billing_mode === mode ? ' on' : ''}`}
              onClick={() => { set('billing_mode', mode); if (err) setErr('') }}
            >
              {t(`groupBilling.${mode}`)}
            </Btn>
          ))}
        </Box>
      </Box>

      {form.billing_mode === 'package' && (
        <Box className="m-row2">
          <Box className="m-field">
            <Box as="label" className="m-label">{t('editGroup.packagePrice')}</Box>
            <Input type="number" min="0" className="m-input" value={form.package_price} onChange={(e) => set('package_price', e.target.value)} />
          </Box>
          <Box className="m-field">
            <Box as="label" className="m-label">{t('editGroup.sessionCount')}</Box>
            <Input type="number" min="1" className="m-input" value={form.package_sessions} onChange={(e) => set('package_sessions', e.target.value)} />
          </Box>
        </Box>
      )}

      {form.billing_mode === 'per_session' && (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('editGroup.pricePerSession')}</Box>
          <Input type="number" min="0" className="m-input" value={form.price_per_session} onChange={(e) => set('price_per_session', e.target.value)} />
        </Box>
      )}

      {form.billing_mode === 'none' && (
        <Txt as="p" className="m-hint">{t('editGroup.noneHint')}</Txt>
      )}
      <Box className="m-row2">
        <Box className="m-field">
          <Box as="label" className="m-label">{t('editGroup.fixedDay')}</Box>
          <select className="m-select" value={form.recurring_day} onChange={(e) => set('recurring_day', e.target.value)}>
            <option value="">{t('common.none')}</option>
            {DAYS.map((d) => <option key={d} value={d}>{t(`common.day${d}`)}</option>)}
          </select>
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('editGroup.startTime')}</Box>
          <Input type="time" className="m-input" value={form.recurring_time} onChange={(e) => set('recurring_time', e.target.value)} />
        </Box>
      </Box>
      <Box className="m-row2">
        <Box className="m-field">
          <Box as="label" className="m-label">{t('editGroup.endTime')}</Box>
          <Input type="time" className="m-input" value={form.recurring_end_time} onChange={(e) => set('recurring_end_time', e.target.value)} />
        </Box>
      </Box>
      <Box className="m-row2">
        <Box className="m-field">
          <Box as="label" className="m-label">{t('editGroup.startDateOptional')}</Box>
          <DateField value={form.recurring_start_date} onChange={(e) => set('recurring_start_date', e.target.value)} />
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('editGroup.endDateOptional')}</Box>
          <DateField value={form.recurring_end_date} onChange={(e) => set('recurring_end_date', e.target.value)} />
        </Box>
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('editGroup.color')}</Box>
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
      {onDelete && (
        <Btn type="button" className="m-btn-delete" onClick={() => onDelete(group)}>
          <Trash2 size={15} strokeWidth={1.7} aria-hidden="true" /> {t('editGroup.deleteGroup')}
        </Btn>
      )}
    </Modal>
  )
}
