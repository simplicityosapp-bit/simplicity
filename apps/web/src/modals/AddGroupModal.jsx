import { useState } from 'react'
import Modal from './Modal'
import DateField from '../components/DateField'
import { GROUP_BILLING_MODES } from '@simplicity/core'
import { useT } from '../i18n/useT'
import { CATEGORY_SWATCHES as COLORS } from '../lib/palette'
import { Box, Txt, Btn, Input } from '../components/ui'

const DAYS = [0, 1, 2, 3, 4, 5, 6]
const blank = () => ({
  name: '', color: COLORS[0], billing_mode: 'package',
  package_price: '', package_sessions: '', price_per_session: '',
  recurring_day: '', recurring_time: '', recurring_end_time: '', recurring_start_date: '', recurring_end_date: '',
})

/* Create a group under a given project (passed in). package_price + sessions
   define the membership tuition. Recurring day/time are optional. */
export default function AddGroupModal({ open, onClose, onSave, project }) {
  const { t } = useT('modalsClient')
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    if (!form.name.trim()) { setErr(t('common.nameRequired')); return }
    const mode = form.billing_mode
    const price = parseFloat(form.package_price)
    const sess = parseInt(form.package_sessions, 10)
    const perSession = parseFloat(form.price_per_session)
    /* Validate only the fields the chosen billing mode actually uses. */
    if (mode === 'package') {
      if (!(price > 0)) { setErr(t('addGroup.errPackagePrice')); return }
      if (!(sess > 0)) { setErr(t('addGroup.errSessions')); return }
    } else if (mode === 'per_session') {
      if (!(perSession > 0)) { setErr(t('addGroup.errPerSession')); return }
    }
    setBusy(true)
    setErr('')
    try {
      await onSave({
        project_id: project.id,
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
        status: 'active',
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  const nameMissing = !!err && !form.name.trim()

  return (
    <Modal open={open} onClose={close} title={t('addGroup.title')}>
      {project && (
        <Txt as="p" className="m-sub">
          <Txt className="m-sub-dot" style={{ background: project.color || 'var(--stone)' }} />
          {project.name}
        </Txt>
      )}
      <Box className="m-field">
        <Box as="label" className="m-label">{t('addGroup.groupName')}</Box>
        <Input
          className={`m-input${nameMissing ? ' err' : ''}`}
          value={form.name}
          onChange={(e) => { set('name', e.target.value); if (err) setErr('') }}
          placeholder={t('addGroup.groupNamePlaceholder')}
        />
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('addGroup.pricing')}</Box>
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
            <Box as="label" className="m-label">{t('addGroup.packagePrice')}</Box>
            <Input
              type="number"
              min="0"
              className="m-input"
              value={form.package_price}
              onChange={(e) => set('package_price', e.target.value)}
            />
          </Box>
          <Box className="m-field">
            <Box as="label" className="m-label">{t('addGroup.sessionCount')}</Box>
            <Input
              type="number"
              min="1"
              className="m-input"
              value={form.package_sessions}
              onChange={(e) => set('package_sessions', e.target.value)}
            />
          </Box>
        </Box>
      )}

      {form.billing_mode === 'per_session' && (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('addGroup.pricePerSession')}</Box>
          <Input
            type="number"
            min="0"
            className="m-input"
            value={form.price_per_session}
            onChange={(e) => set('price_per_session', e.target.value)}
          />
        </Box>
      )}

      {form.billing_mode === 'none' && (
        <Txt as="p" className="m-hint">{t('addGroup.noneHint')}</Txt>
      )}
      <Box className="m-row2">
        <Box className="m-field">
          <Box as="label" className="m-label">{t('addGroup.fixedDayOptional')}</Box>
          <select className="m-select" value={form.recurring_day} onChange={(e) => set('recurring_day', e.target.value)}>
            <option value="">{t('common.none')}</option>
            {DAYS.map((d) => <option key={d} value={d}>{t(`common.day${d}`)}</option>)}
          </select>
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('addGroup.startTimeOptional')}</Box>
          <Input type="time" className="m-input" value={form.recurring_time} onChange={(e) => set('recurring_time', e.target.value)} />
        </Box>
      </Box>
      <Box className="m-row2">
        <Box className="m-field">
          <Box as="label" className="m-label">{t('addGroup.endTimeOptional')}</Box>
          <Input type="time" className="m-input" value={form.recurring_end_time} onChange={(e) => set('recurring_end_time', e.target.value)} />
        </Box>
      </Box>
      <Box className="m-row2">
        <Box className="m-field">
          <Box as="label" className="m-label">{t('addGroup.startDateOptional')}</Box>
          <DateField value={form.recurring_start_date} onChange={(e) => set('recurring_start_date', e.target.value)} />
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('addGroup.endDateOptional')}</Box>
          <DateField value={form.recurring_end_date} onChange={(e) => set('recurring_end_date', e.target.value)} />
        </Box>
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('addGroup.color')}</Box>
        <Box className="m-colors">
          {COLORS.map((c) => (
            <Btn key={c} type="button" className={`m-color${form.color === c ? ' on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => set('color', c)} />
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
