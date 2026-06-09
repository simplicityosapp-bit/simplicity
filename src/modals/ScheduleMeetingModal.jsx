import { useState } from 'react'
import DateField from '../components/DateField'
import Modal from './Modal'
import { useAddress } from '../hooks/useAddress'

const todayStr = () => new Date().toISOString().slice(0, 10)
const blank = (clientId = '') => ({ client_id: clientId, date: todayStr(), time: '09:00' })
const HEB_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

/* Schedule a future client meeting. If `client` is given the client is locked
   (drawer flow); otherwise a client picker is shown (calendar flow).

   When `onSetRecurringSlot` is provided AND a client is locked, a "שעה קבועה"
   toggle appears (beta 07/06/2026): instead of one pending meeting it writes
   the client's weekly recurring slot (recurring_day + recurring_time), and the
   existing scheduled-meetings engine fans the series across its rolling window
   — perpetual until changed or cleared in the client editor. Replacing an
   existing slot asks once before overwriting. */
export default function ScheduleMeetingModal({ open, onClose, onSave, client, clients = [], onSetRecurringSlot }) {
  const { addr, tryAgain } = useAddress()
  const [form, setForm] = useState(() => blank(client?.id || ''))
  const [recurring, setRecurring] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => {
    setForm(blank(client?.id || ''))
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
    if (!clientId) { setErr('יש לבחור לקוח.'); return }
    if (!form.date || !form.time) { setErr('יש לבחור תאריך ושעה.'); return }
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
        setErr('השמירה נכשלה: ' + (e.message || tryAgain))
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
      setErr('השמירה נכשלה: ' + (e.message || tryAgain))
    }
  }

  const showReplaceWarning = recurring && confirmReplace && hasExistingSlot

  return (
    <Modal open={open} onClose={close} title="תיאום פגישה">
      {client ? (
        <p className="m-sub">
          <span className="m-sub-dot" style={{ background: 'var(--terracotta)' }} />
          {client.name}
        </p>
      ) : (
        <div className="m-field">
          <label className="m-label">לקוח</label>
          <select className="m-select" value={form.client_id} onChange={(e) => { set('client_id', e.target.value); if (err) setErr('') }}>
            <option value="">{addr({ male: 'בחר לקוח', female: 'בחרי לקוח', neutral: 'בחר/י לקוח' })}</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">תאריך</label>
          <DateField value={form.date} onChange={(e) => set('date', e.target.value)} />
        </div>
        <div className="m-field">
          <label className="m-label">שעה</label>
          <input type="time" className="m-input" value={form.time} onChange={(e) => set('time', e.target.value)} />
        </div>
      </div>

      {canRecur && (
        <div className="m-field">
          <label className="m-label">סוג הפגישה</label>
          <div className="m-pills">
            <button
              type="button"
              className={`m-pill${!recurring ? ' on' : ''}`}
              onClick={() => { setRecurring(false); setConfirmReplace(false); if (err) setErr('') }}
            >
              חד-פעמית
            </button>
            <button
              type="button"
              className={`m-pill${recurring ? ' on' : ''}`}
              onClick={() => { setRecurring(true); if (err) setErr('') }}
            >
              שעה קבועה
            </button>
          </div>
          {recurring && (
            <p className="m-hint">פגישה שבועית קבועה בכל יום {HEB_DAYS[slotDow]} בשעה {form.time}. אפשר לשנות או לבטל בעריכת הלקוח.</p>
          )}
        </div>
      )}

      {showReplaceWarning && (
        <p className="m-hint">ללקוח כבר מוגדרת שעה קבועה ביום {HEB_DAYS[client.recurring_day]} בשעה {client.recurring_time}. לחיצה על "כן, החלף" תחליף אותה.</p>
      )}

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={close}>ביטול</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>
          {busy ? 'שומר…' : (showReplaceWarning ? 'כן, החלף' : 'שמירה')}
        </button>
      </div>
    </Modal>
  )
}
