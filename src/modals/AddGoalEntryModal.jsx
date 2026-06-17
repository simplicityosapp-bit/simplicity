import { useState } from 'react'
import DateField from '../components/DateField'
import Modal from './Modal'
import { useT } from '../i18n/useT'

/* LOCAL today (UTC toISOString would roll to tomorrow on Israeli evenings,
   pre-filling a future date that goal scoring then silently ignores). */
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const blank = () => ({ value: '', date: todayStr(), note: '' })

/* Log a manual progress entry for a category. onSave receives a row ready
   for goal_entries (category_id filled by the caller). */
export default function AddGoalEntryModal({ open, onClose, onSave, category }) {
  const { t } = useT('modalsData')
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    const value = parseFloat(form.value)
    if (Number.isNaN(value)) { setErr(t('goalEntry.needValue')); return }
    if (!form.date) { setErr(t('goalEntry.needDate')); return }
    if (form.date > todayStr()) { setErr(t('goalEntry.noFutureDate')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({
        category_id: category.id,
        project_id: null,
        group_id: null,
        date: form.date,
        value,
        note: form.note.trim() || null,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  return (
    <Modal open={open} onClose={close} title={t('goalEntry.title')}>
      {category && (
        <p className="m-sub">
          <span className="m-sub-dot" style={{ background: category.color || 'var(--stone)' }} />
          {category.icon ? category.icon + ' ' : ''}{category.name}
        </p>
      )}
      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">{t('goalEntry.value')}</label>
          <input
            type="number"
            className={`m-input${err && Number.isNaN(parseFloat(form.value)) ? ' err' : ''}`}
            value={form.value}
            onChange={(e) => { set('value', e.target.value); if (err) setErr('') }}
            placeholder="0"
          />
        </div>
        <div className="m-field">
          <label className="m-label">{t('common.date')}</label>
          <DateField value={form.date} onChange={(e) => set('date', e.target.value)} />
        </div>
      </div>
      <div className="m-field">
        <label className="m-label">{t('goalEntry.noteOptional')}</label>
        <input className="m-input" value={form.note} onChange={(e) => set('note', e.target.value)} placeholder={t('goalEntry.notePlaceholder')} />
      </div>

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={close}>{t('common.cancel')}</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
      </div>
    </Modal>
  )
}
