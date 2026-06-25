import { useState } from 'react'
import DateField from '../components/DateField'
import Modal from './Modal'
import { useT } from '../i18n/useT'

const todayStr = () => new Date().toISOString().slice(0, 10)
const blank = (clientId = '', date, time) => ({ client_id: clientId, date: date || todayStr(), time: time || '09:00' })
const HEB_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

/* Schedule a future client meeting. If `client` is given the client is locked
   (drawer flow); otherwise a client picker is shown (calendar flow).

   When `onSetRecurringSlot` is provided AND a client is locked, a "שעה קבועה"
   toggle appears (beta 07/06/2026): instead of one pending meeting it writes
   the client's weekly recurring slot (recurring_day + recurring_time), and the
   existing scheduled-meetings engine fans the series across its rolling window
   — perpetual until changed or cleared in the client editor. Replacing an
   existing slot asks once before overwriting. */
export default function ScheduleMeetingModal({ open, onClose, onSave, client, clients = [], onSetRecurringSlot, initialDate, initialTime }) {
  const { t } = useT('modalsTask')
  /* initialDate/initialTime prefill the form when opened from a tapped
     calendar slot (the parent remounts via `key` so this initializer
     re-runs per slot). Falls back to today/09:00 for the + flow. */
  const [form, setForm] = useState(() => blank(client?.id || '', initialDate, initialTime))
  const [recurring, setRecurring] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => {
    setForm(blank(client?.id || '', initialDate, initialTime))
    setRecurring(false)
    setConfirmReplace(false)
    setErr('')
    setBusy(false)
    onClose()
  }

  /* The toggle only makes sense when we can write back to a known client. */
  const canRecur = !!(client && onSetRecurringSlot)
  const slotDow = new Date(`${form.date || todayStr()}T${form.time || '09:00'}`).getDay()
  const hasExistingSlot = !!(client && client.recurring_day != null && client.recurring_time)

  const submit = async () => {
    const clientId = client?.id || form.client_id
    if (!clientId) { setErr(t('meeting.clientRequired')); return }
    if (!form.date || !form.time) { setErr(t('meeting.dateTimeRequired')); return }
    setErr('')

    /* Recurring path — set the client's weekly slot and let the engine build
       the series. Overwriting an existing slot is confirmed once. */
    if (recurring && canRecur) {
      if (hasExistingSlot && !confirmReplace) { setConfirmReplace(true); return }
      setBusy(true)
      try {
        await onSetRecurringSlot(clientId, {
          recurring_day: slotDow,
          recurring_time: form.time,
          recurring_start_date: form.date,
          recurring_end_date: null,
        })
        close()
      } catch (e) {
        setBusy(false)
        setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
      }
      return
    }

    /* One-off path (unchanged). */
    setBusy(true)
    try {
      await onSave({
        subject_type: 'client',
        subject_id: clientId,
        scheduled_at: new Date(`${form.date}T${form.time}`).toISOString(),
        status: 'pending',
        session_id: null,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  const showReplaceWarning = recurring && confirmReplace && hasExistingSlot

  return (
    <Modal open={open} onClose={close} title={t('meeting.title')}>
      {client ? (
        <p className="m-sub">
          <span className="m-sub-dot" style={{ background: 'var(--terracotta)' }} />
          {client.name}
        </p>
      ) : (
        <div className="m-field">
          <label className="m-label">{t('meeting.client')}</label>
          <select className="m-select" value={form.client_id} onChange={(e) => { set('client_id', e.target.value); if (err) setErr('') }}>
            <option value="">{t('meeting.pickClient')}</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">{t('meeting.date')}</label>
          <DateField value={form.date} onChange={(e) => set('date', e.target.value)} />
        </div>
        <div className="m-field">
          <label className="m-label">{t('meeting.time')}</label>
          <input type="time" className="m-input" value={form.time} onChange={(e) => set('time', e.target.value)} />
        </div>
      </div>

      {canRecur && (
        <div className="m-field">
          <label className="m-label">{t('meeting.meetingType')}</label>
          <div className="m-pills">
            <button
              type="button"
              className={`m-pill${!recurring ? ' on' : ''}`}
              onClick={() => { setRecurring(false); setConfirmReplace(false); if (err) setErr('') }}
            >
              {t('meeting.once')}
            </button>
            <button
              type="button"
              className={`m-pill${recurring ? ' on' : ''}`}
              onClick={() => { setRecurring(true); if (err) setErr('') }}
            >
              {t('meeting.recurring')}
            </button>
          </div>
          {recurring && (
            <p className="m-hint">{t('meeting.recurringHint', { day: HEB_DAYS[slotDow], time: form.time })}</p>
          )}
        </div>
      )}

      {showReplaceWarning && (
        <p className="m-hint">{t('meeting.replaceWarning', { day: HEB_DAYS[client.recurring_day], time: client.recurring_time })}</p>
      )}

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={close}>{t('common.cancel')}</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>
          {busy ? t('common.saving') : (showReplaceWarning ? t('meeting.replaceConfirm') : t('common.save'))}
        </button>
      </div>
    </Modal>
  )
}
