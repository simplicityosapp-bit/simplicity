import { useState } from 'react'
import DateField from '../components/DateField'
import Modal from './Modal'

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const now = () => new Date()
const blank = () => ({
  title: '', description: '',
  date: todayStr(), time: '09:00',
  client_id: '',
  recurrence: 'none',
  day_of_week: String(new Date().getDay()),   // weekly: 0=ראשון … 6=שבת
  day_of_month: String(new Date().getDate()),  // monthly: 1–31
  every_x: '2',
  end_date: '',
})
const RECURRENCES = [
  { k: 'none', l: 'חד-פעמית' },
  { k: 'weekly', l: 'שבועי' },
  { k: 'monthly_date', l: 'חודשי' },
  { k: 'every_x_days', l: 'כל X ימים' },
]
const HEB_DAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

/* Next future occurrence of `dow` (0–6) at HH:MM. Today counts only if its
   time hasn't passed yet — otherwise the same weekday next week. */
function nextWeekly(dow, time) {
  const [h, m] = (time || '09:00').split(':').map(Number)
  const n = now()
  const d = new Date(n.getFullYear(), n.getMonth(), n.getDate(), h, m, 0, 0)
  let add = (dow - d.getDay() + 7) % 7
  if (add === 0 && d <= n) add = 7
  d.setDate(d.getDate() + add)
  return d
}

/* Next occurrence of day-of-month `dom` at HH:MM, clamped to month length
   (e.g. 31 in a 30-day month → the 30th). This month if it hasn't passed,
   else next month. */
function nextMonthly(dom, time) {
  const [h, m] = (time || '09:00').split(':').map(Number)
  const n = now()
  const mk = (year, month) => {
    const last = new Date(year, month + 1, 0).getDate()
    return new Date(year, month, Math.min(dom, last), h, m, 0, 0)
  }
  let d = mk(n.getFullYear(), n.getMonth())
  if (d <= n) d = mk(n.getFullYear(), n.getMonth() + 1)
  return d
}

/* Reverse-map an existing reminder into the form shape (for editing). */
function fromReminder(r) {
  if (!r) return blank()
  const d = new Date(r.scheduled_at)
  const pad = (x) => String(x).padStart(2, '0')
  const rec = r.recurrence_type || 'none'
  return {
    title: r.title || '',
    description: r.description || '',
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    client_id: (r.linked_to_type === 'client' && r.linked_to_id) ? r.linked_to_id : '',
    recurrence: rec,
    day_of_week: String(r.recurrence_pattern?.dayOfWeek ?? new Date().getDay()),
    day_of_month: String(r.recurrence_pattern?.dayOfMonth ?? new Date().getDate()),
    every_x: String(r.recurrence_pattern?.x ?? 2),
    end_date: r.end_date || '',
  }
}

/* onSave is async (Supabase insert). Supports one-off or recurring reminders.
   Recurrence is chosen FIRST, then a fitting timing field appears: a weekday
   for weekly, a day-of-month for monthly, a start date for every-X / one-off.
   This avoids the confusing "pick a calendar date for a weekly reminder"
   (which silently defaulted to today → everything showed "היום").
   `defaultLinkedTo` pre-binds the reminder to a project/group/etc. and hides
   the client selector — used when opened from a project drawer. */
export default function AddReminderModal({ open, onClose, onSave, clients = [], defaultLinkedTo = null, linkedSubjectName = '', reminder = null }) {
  const isEdit = !!reminder
  const [form, setForm] = useState(() => fromReminder(reminder))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(fromReminder(reminder)); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    if (!form.title.trim()) { setErr('יש למלא כותרת.'); return }
    if (!form.time) { setErr('יש לבחור שעה.'); return }

    let scheduled
    let pattern = null
    if (form.recurrence === 'weekly') {
      const dow = Number(form.day_of_week)
      scheduled = nextWeekly(dow, form.time)
      pattern = { dayOfWeek: dow }
    } else if (form.recurrence === 'monthly_date') {
      const dom = parseInt(form.day_of_month, 10)
      if (!dom || dom < 1 || dom > 31) { setErr('יש לבחור יום בחודש בין 1 ל-31.'); return }
      scheduled = nextMonthly(dom, form.time)
      pattern = { dayOfMonth: dom }
    } else if (form.recurrence === 'every_x_days') {
      const x = parseInt(form.every_x, 10)
      if (!x || x < 1) { setErr('יש לבחור מספר ימים חיובי.'); return }
      if (!form.date) { setErr('יש לבחור תאריך התחלה.'); return }
      scheduled = new Date(`${form.date}T${form.time}`)
      pattern = { x }
    } else {
      if (!form.date) { setErr('יש לבחור תאריך.'); return }
      scheduled = new Date(`${form.date}T${form.time}`)
    }
    if (Number.isNaN(scheduled.getTime())) { setErr('התאריך או השעה אינם תקינים.'); return }

    /* Editing a recurring reminder without touching its timing should NOT
       reschedule it to the next future slot (that would wipe an overdue
       "×N" state). Only recompute when the recurrence/day/time actually
       changed; otherwise keep the stored scheduled_at. */
    if (isEdit && reminder?.scheduled_at && form.recurrence !== 'none') {
      const orig = fromReminder(reminder)
      const timingChanged =
        form.recurrence !== orig.recurrence ||
        form.time !== orig.time ||
        (form.recurrence === 'weekly' && form.day_of_week !== orig.day_of_week) ||
        (form.recurrence === 'monthly_date' && form.day_of_month !== orig.day_of_month) ||
        (form.recurrence === 'every_x_days' && (form.every_x !== orig.every_x || form.date !== orig.date))
      if (!timingChanged) scheduled = new Date(reminder.scheduled_at)
    }

    /* A recurring reminder whose end date is before its first occurrence
       would be born already-expired — reject it instead of silently saving. */
    if (form.recurrence !== 'none' && form.end_date
        && new Date(`${form.end_date}T23:59:59`) < scheduled) {
      setErr('תאריך הסיום מוקדם מהמופע הראשון של התזכורת.'); return
    }

    setBusy(true)
    setErr('')
    try {
      await onSave({
        title: form.title.trim(),
        description: form.description.trim() || null,
        scheduled_at: scheduled.toISOString(),
        recurrence_type: form.recurrence,
        recurrence_pattern: pattern,
        end_date: form.recurrence !== 'none' && form.end_date ? form.end_date : null,
        linked_to_type: defaultLinkedTo?.type || (form.client_id ? 'client' : null),
        linked_to_id: defaultLinkedTo?.id || form.client_id || null,
        ...(isEdit ? {} : { status: 'pending', type: null, channel: null }),
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr('השמירה נכשלה: ' + (e.message || 'נסה/י שוב'))
    }
  }

  const titleMissing = !!err && !form.title.trim()
  const recurring = form.recurrence !== 'none'

  return (
    <Modal open={open} onClose={close} title={isEdit ? 'עריכת תזכורת' : 'תזכורת חדשה'}>
      <div className="m-field">
        <label className="m-label">על מה להזכיר?</label>
        <input
          className={`m-input${titleMissing ? ' err' : ''}`}
          value={form.title}
          onChange={(e) => { set('title', e.target.value); if (err) setErr('') }}
          placeholder="כותרת התזכורת"
        />
      </div>

      <div className="m-field">
        <label className="m-label">חזרתיות</label>
        <div className="m-pills">
          {RECURRENCES.map((r) => (
            <button key={r.k} type="button" className={`m-pill${form.recurrence === r.k ? ' on' : ''}`} onClick={() => { set('recurrence', r.k); if (err) setErr('') }}>{r.l}</button>
          ))}
        </div>
      </div>

      {/* Timing field adapts to the recurrence so there's never a stray
          "pick a date" for a weekly/monthly reminder. */}
      {form.recurrence === 'none' && (
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
      )}

      {form.recurrence === 'weekly' && (
        <>
          <div className="m-field">
            <label className="m-label">יום בשבוע</label>
            <div className="m-pills">
              {HEB_DAYS_SHORT.map((d, i) => (
                <button key={i} type="button" className={`m-pill${Number(form.day_of_week) === i ? ' on' : ''}`} onClick={() => set('day_of_week', String(i))}>{d}</button>
              ))}
            </div>
          </div>
          <div className="m-field">
            <label className="m-label">שעה</label>
            <input type="time" className="m-input" value={form.time} onChange={(e) => set('time', e.target.value)} />
          </div>
        </>
      )}

      {form.recurrence === 'monthly_date' && (
        <div className="m-row2">
          <div className="m-field">
            <label className="m-label">יום בחודש</label>
            <input type="number" min="1" max="31" className="m-input" value={form.day_of_month} onChange={(e) => { set('day_of_month', e.target.value); if (err) setErr('') }} />
          </div>
          <div className="m-field">
            <label className="m-label">שעה</label>
            <input type="time" className="m-input" value={form.time} onChange={(e) => set('time', e.target.value)} />
          </div>
        </div>
      )}

      {form.recurrence === 'every_x_days' && (
        <>
          <div className="m-row2">
            <div className="m-field">
              <label className="m-label">החל מתאריך</label>
              <DateField value={form.date} onChange={(e) => set('date', e.target.value)} />
            </div>
            <div className="m-field">
              <label className="m-label">שעה</label>
              <input type="time" className="m-input" value={form.time} onChange={(e) => set('time', e.target.value)} />
            </div>
          </div>
          <div className="m-field">
            <label className="m-label">כל כמה ימים</label>
            <input type="number" min="1" className="m-input" value={form.every_x} onChange={(e) => { set('every_x', e.target.value); if (err) setErr('') }} />
          </div>
        </>
      )}

      {recurring && (
        <div className="m-field">
          <label className="m-label">תאריך סיום (אופציונלי)</label>
          <DateField value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
        </div>
      )}

      {defaultLinkedTo ? (
        <div className="m-field">
          <label className="m-label">מקושרת ל</label>
          <p className="m-sub">
            <span className="m-sub-dot" style={{ background: 'var(--clay)' }} />
            {linkedSubjectName || (defaultLinkedTo.type === 'project' ? 'פרויקט' : defaultLinkedTo.type)}
          </p>
        </div>
      ) : (
        <div className="m-field">
          <label className="m-label">לקוח מקושר (אופציונלי)</label>
          <select className="m-select" value={form.client_id} onChange={(e) => set('client_id', e.target.value)}>
            <option value="">ללא</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <div className="m-field">
        <label className="m-label">פרטים (אופציונלי)</label>
        <textarea className="m-textarea" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="פרטים נוספים" />
      </div>

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={close}>ביטול</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
      </div>
    </Modal>
  )
}
