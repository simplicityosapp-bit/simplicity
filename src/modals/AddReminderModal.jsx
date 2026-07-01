import { useState } from 'react'
import DateField from '../components/DateField'
import Modal from './Modal'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input, Textarea } from '../components/ui'

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const now = () => new Date()
const blank = (date, time) => ({
  title: '', description: '',
  date: date || todayStr(), time: time || '09:00',
  client_id: '',
  category_id: '',
  recurrence: 'none',
  day_of_week: String(new Date().getDay()),   // weekly: 0=ראשון … 6=שבת
  day_of_month: String(new Date().getDate()),  // monthly: 1–31
  every_x: '2',
  end_date: '',
})
const RECURRENCES = [
  { k: 'none', l: 'recOnce' },
  { k: 'weekly', l: 'recWeekly' },
  { k: 'monthly_date', l: 'recMonthly' },
  { k: 'every_x_days', l: 'recEveryX' },
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
function fromReminder(r, date, time) {
  if (!r) return blank(date, time)
  const d = new Date(r.scheduled_at)
  const pad = (x) => String(x).padStart(2, '0')
  const rec = r.recurrence_type || 'none'
  return {
    title: r.title || '',
    description: r.description || '',
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    client_id: (r.linked_to_type === 'client' && r.linked_to_id) ? r.linked_to_id : '',
    category_id: r.category_id || '',
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
export default function AddReminderModal({ open, onClose, onSave, clients = [], categories = [], defaultLinkedTo = null, linkedSubjectName = '', reminder = null, initialDate, initialTime }) {
  const isEdit = !!reminder
  const { t } = useT('modalsTask')
  /* initialDate/initialTime prefill a NEW one-off reminder when opened from a
     tapped calendar slot (parent remounts via key); ignored when editing. */
  const [form, setForm] = useState(() => fromReminder(reminder, initialDate, initialTime))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(fromReminder(reminder, initialDate, initialTime)); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    if (!form.title.trim()) { setErr(t('reminder.titleRequired')); return }
    if (!form.time) { setErr(t('reminder.timeRequired')); return }

    let scheduled
    let pattern = null
    if (form.recurrence === 'weekly') {
      const dow = Number(form.day_of_week)
      scheduled = nextWeekly(dow, form.time)
      pattern = { dayOfWeek: dow }
    } else if (form.recurrence === 'monthly_date') {
      const dom = parseInt(form.day_of_month, 10)
      if (!dom || dom < 1 || dom > 31) { setErr(t('reminder.dayOfMonthRange')); return }
      scheduled = nextMonthly(dom, form.time)
      pattern = { dayOfMonth: dom }
    } else if (form.recurrence === 'every_x_days') {
      const x = parseInt(form.every_x, 10)
      if (!x || x < 1) { setErr(t('reminder.everyXPositive')); return }
      if (!form.date) { setErr(t('reminder.startDateRequired')); return }
      scheduled = new Date(`${form.date}T${form.time}`)
      pattern = { x }
    } else {
      if (!form.date) { setErr(t('reminder.dateRequired')); return }
      scheduled = new Date(`${form.date}T${form.time}`)
    }
    if (Number.isNaN(scheduled.getTime())) { setErr(t('reminder.invalidDateTime')); return }

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
      setErr(t('reminder.endBeforeFirst')); return
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
        category_id: form.category_id || null,
        ...(isEdit ? {} : { status: 'pending', type: null, channel: null }),
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  const titleMissing = !!err && !form.title.trim()
  const recurring = form.recurrence !== 'none'

  return (
    <Modal open={open} onClose={close} title={isEdit ? t('reminder.titleEdit') : t('reminder.titleNew')}>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('reminder.what')}</Box>
        <Input
          className={`m-input${titleMissing ? ' err' : ''}`}
          value={form.title}
          onChange={(e) => { set('title', e.target.value); if (err) setErr('') }}
          placeholder={t('reminder.titlePlaceholder')}
        />
      </Box>

      <Box className="m-field">
        <Box as="label" className="m-label">{t('reminder.recurrence')}</Box>
        <Box className="m-pills">
          {RECURRENCES.map((r) => (
            <Btn key={r.k} type="button" className={`m-pill${form.recurrence === r.k ? ' on' : ''}`} onClick={() => { set('recurrence', r.k); if (err) setErr('') }}>{t(`reminder.${r.l}`)}</Btn>
          ))}
        </Box>
      </Box>

      {/* Timing field adapts to the recurrence so there's never a stray
          "pick a date" for a weekly/monthly reminder. */}
      {form.recurrence === 'none' && (
        <Box className="m-row2">
          <Box className="m-field">
            <Box as="label" className="m-label">{t('reminder.date')}</Box>
            <DateField value={form.date} onChange={(e) => set('date', e.target.value)} />
          </Box>
          <Box className="m-field">
            <Box as="label" className="m-label">{t('reminder.time')}</Box>
            <Input type="time" className="m-input" value={form.time} onChange={(e) => set('time', e.target.value)} />
          </Box>
        </Box>
      )}

      {form.recurrence === 'weekly' && (
        <>
          <Box className="m-field">
            <Box as="label" className="m-label">{t('reminder.dayOfWeek')}</Box>
            <Box className="m-pills">
              {HEB_DAYS_SHORT.map((d, i) => (
                <Btn key={i} type="button" className={`m-pill${Number(form.day_of_week) === i ? ' on' : ''}`} onClick={() => set('day_of_week', String(i))}>{d}</Btn>
              ))}
            </Box>
          </Box>
          <Box className="m-field">
            <Box as="label" className="m-label">{t('reminder.time')}</Box>
            <Input type="time" className="m-input" value={form.time} onChange={(e) => set('time', e.target.value)} />
          </Box>
        </>
      )}

      {form.recurrence === 'monthly_date' && (
        <Box className="m-row2">
          <Box className="m-field">
            <Box as="label" className="m-label">{t('reminder.dayOfMonth')}</Box>
            <Input type="number" min="1" max="31" className="m-input" value={form.day_of_month} onChange={(e) => { set('day_of_month', e.target.value); if (err) setErr('') }} />
          </Box>
          <Box className="m-field">
            <Box as="label" className="m-label">{t('reminder.time')}</Box>
            <Input type="time" className="m-input" value={form.time} onChange={(e) => set('time', e.target.value)} />
          </Box>
        </Box>
      )}

      {form.recurrence === 'every_x_days' && (
        <>
          <Box className="m-row2">
            <Box className="m-field">
              <Box as="label" className="m-label">{t('reminder.startFrom')}</Box>
              <DateField value={form.date} onChange={(e) => set('date', e.target.value)} />
            </Box>
            <Box className="m-field">
              <Box as="label" className="m-label">{t('reminder.time')}</Box>
              <Input type="time" className="m-input" value={form.time} onChange={(e) => set('time', e.target.value)} />
            </Box>
          </Box>
          <Box className="m-field">
            <Box as="label" className="m-label">{t('reminder.everyHowMany')}</Box>
            <Input type="number" min="1" className="m-input" value={form.every_x} onChange={(e) => { set('every_x', e.target.value); if (err) setErr('') }} />
          </Box>
        </>
      )}

      {recurring && (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('reminder.endDate')}</Box>
          <DateField value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
        </Box>
      )}

      {defaultLinkedTo ? (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('reminder.linkedTo')}</Box>
          <Txt as="p" className="m-sub">
            <Txt className="m-sub-dot" style={{ background: 'var(--clay)' }} />
            {linkedSubjectName || (defaultLinkedTo.type === 'project' ? t('reminder.project') : defaultLinkedTo.type)}
          </Txt>
        </Box>
      ) : (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('reminder.linkedClient')}</Box>
          <select className="m-select" value={form.client_id} onChange={(e) => set('client_id', e.target.value)}>
            <option value="">{t('common.none')}</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Box>
      )}
      {categories.length > 0 && (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('reminder.category')}</Box>
          <select className="m-select" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
            <option value="">{t('common.none')}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Box>
      )}
      <Box className="m-field">
        <Box as="label" className="m-label">{t('reminder.details')}</Box>
        <Textarea className="m-textarea" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder={t('reminder.detailsPlaceholder')} />
      </Box>

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={close}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</Btn>
      </Box>
    </Modal>
  )
}
