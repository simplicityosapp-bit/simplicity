import { useState } from 'react'
import DateField from '../components/DateField'
import SelectMenu from '../components/SelectMenu'
import Modal from './Modal'
import { useDiscardGuard, isDirty, useScrollToError } from './useDiscardGuard'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input } from '../components/ui'

/* Local YYYY-MM-DD — UTC toISOString would roll over to "tomorrow" on an
   Israeli evening, defaulting the date field to the wrong day. */
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/* The length the day view has always assumed when it had nothing to go on.
   Seeded into the form rather than left blank so the assumption becomes a
   visible, editable number instead of a silent one. */
const DEFAULT_DURATION_MIN = 60
const blank = (subject = '', date, time) => ({ subject, date: date || todayStr(), time: time || '09:00', duration: DEFAULT_DURATION_MIN })

/* The picker carries the subject's TYPE as well as its id, because
   scheduled_meetings is keyed on the pair and a bare id could belong to
   either table. "client:<uuid>" / "group:<uuid>" — a colon is safe as the
   separator, uuids contain hyphens but never one. */
const subjectValue = (type, id) => `${type}:${id}`
const parseSubject = (v) => {
  const raw = String(v || '')
  const at = raw.indexOf(':')
  const type = raw.slice(0, at)
  const id = raw.slice(at + 1)
  return id && (type === 'client' || type === 'group') ? { type, id } : null
}

/* Schedule a future meeting. If `client` is given the client is locked
   (drawer flow); otherwise a subject picker is shown (calendar flow).

   `groups` is opt-in. scheduled_meetings has carried subject_type since it
   was created and every reader already handles 'group' — the calendar names
   them, confirming one materialises a group session — but nothing could ever
   CREATE one, so a coach who runs groups had no way in. Passing the list turns
   the picker into clients + groups; callers that omit it (the home and
   project quick rows) keep exactly the client-only control they had.

   This form also carried a "שעה קבועה" branch that wrote the client's weekly
   recurring slot instead of one pending meeting, guarded by
   `client && onSetRecurringSlot`. 87e2e7bc removed the only caller that
   supplied either — the client file's booking button, dropped on the owner's
   call that booking always happens in the calendar — so the toggle, the slot
   write, the replace confirmation and its warning had all been unreachable
   since. Removed here rather than left as scenery.
   The weekly slot is still set where it belongs, on the client rather than on
   a booking: the drawer's own "פגישה שבועית קבועה" editor and the scheduling
   section of EditClientModal. Neither needs the replace warning this branch
   had — the field IS the subject of those forms, shown with its current value,
   so changing it is the intent rather than a side effect. */
export default function ScheduleMeetingModal({ open, onClose, onSave, client, clients = [], groups = [], initialDate, initialTime }) {
  const { t } = useT('modalsTask')
  /* initialDate/initialTime prefill the form when opened from a tapped
     calendar slot (the parent remounts via `key` so this initializer
     re-runs per slot). Falls back to today/09:00 for the + flow. */
  const [form, setForm] = useState(() => blank(client ? subjectValue('client', client.id) : '', initialDate, initialTime))
  /* Deleted groups are in the trash and must never be schedulable. Status is
     deliberately NOT filtered: the client list beside it doesn't hide 'past'
     clients either, and a coach logging a meeting for a winding-down group is
     doing something legitimate. */
  const pickGroups = (groups || []).filter((g) => !g.deleted_at)
  const hasGroups = pickGroups.length > 0
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => {
    setForm(blank(client ? subjectValue('client', client.id) : '', initialDate, initialTime))
    setErr('')
    setBusy(false)
    onClose()
  }
  /* Escape, the overlay and the X used to bin a scheduled meeting without a
     word. Every field here opens with a value the FORM chose — the locked or
     tapped subject, today, 09:00, 60 minutes — so dirtiness is only ever a
     change away from those, and opening the form by mistake still shuts on
     one tap. */
  const opened = blank(client ? subjectValue('client', client.id) : '', initialDate, initialTime)
  const guard = useDiscardGuard(isDirty(form, opened), close)
  /* A rejected save should put the field it rejected back on screen. */
  useScrollToError(err)

  const submit = async () => {
    const picked = client ? { type: 'client', id: client.id } : parseSubject(form.subject)
    if (!picked) { setErr(t(hasGroups ? 'meeting.subjectRequired' : 'meeting.clientRequired')); return }
    if (!form.date || !form.time) { setErr(t('meeting.dateTimeRequired')); return }
    setErr('')

    const duration = Number(form.duration)
    if (!Number.isFinite(duration) || duration <= 0) { setErr(t('meeting.durationInvalid')); return }
    setBusy(true)
    try {
      await onSave({
        subject_type: picked.type,
        subject_id: picked.id,
        scheduled_at: new Date(`${form.date}T${form.time}`).toISOString(),
        duration_minutes: duration,
        status: 'pending',
        session_id: null,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  /* Clients then groups, each run headed by its own label when both exist.
     With no groups the list stays flat — no heading over a single run. */
  const subjectOptions = [
    ...clients.map((c) => ({
      value: subjectValue('client', c.id),
      label: c.name,
      ...(hasGroups ? { group: t('meeting.clientsGroup') } : {}),
    })),
    ...pickGroups.map((g) => ({
      value: subjectValue('group', g.id),
      label: g.name,
      group: t('meeting.groupsGroup'),
    })),
  ]

  return (
    <Modal open={open} onClose={guard.requestClose} onSubmit={submit} title={t('meeting.title')}>
      {client ? (
        <Txt as="p" className="m-sub">
          <Txt className="m-sub-dot" style={{ background: 'var(--terracotta)' }} />
          {client.name}
        </Txt>
      ) : (
        <Box className="m-field">
          <Box as="label" className="m-label">{t(hasGroups ? 'meeting.subject' : 'meeting.client')}</Box>
          {/* One list rather than a type switch plus a list: the coach is
              choosing WHO, and whether that who is a person or a group is a
              fact about the name, not a separate decision. The headings only
              appear when there is something to separate — a coach with no
              groups sees the plain client list they always saw.
              This was the last native <select> in the add forms; SelectMenu
              gained `group` on its options so the grouping survived the move
              off the OS control. */}
          <SelectMenu
            value={form.subject}
            onChange={(v) => { set('subject', v); if (err) setErr('') }}
            options={subjectOptions}
            placeholder={t(hasGroups ? 'meeting.pickSubject' : 'meeting.pickClient')}
            ariaLabel={t(hasGroups ? 'meeting.subject' : 'meeting.client')}
            searchable={clients.length + pickGroups.length > 8}
            searchPlaceholder={t(hasGroups ? 'meeting.pickSubject' : 'meeting.pickClient')}
          />
        </Box>
      )}
      <Box className="m-row2">
        <Box className="m-field">
          <Box as="label" className="m-label">{t('meeting.date')}</Box>
          <DateField value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('meeting.time')}</Box>
          <Input type="time" className="m-input" value={form.time} onChange={(e) => set('time', e.target.value)} />
        </Box>
      </Box>

      {/* How long. The day view used to draw every meeting as the same block —
          a 90-minute workshop and a 25-minute check-in were one rectangle —
          because the only length it could find belonged to the SUBJECT
          (recurring_end_time), not to the meeting. Same control as the booking
          pages' meeting types: minutes, in fives. */}
      <Box className="m-field">
        <Box as="label" className="m-label" htmlFor="meeting-duration">{t('meeting.duration')}</Box>
        <Input
          id="meeting-duration"
          type="number"
          min="5"
          step="5"
          className="m-input"
          value={form.duration}
          onChange={(e) => { set('duration', e.target.value); if (err) setErr('') }}
        />
        <Txt as="p" className="m-hint">{t('meeting.durationHint')}</Txt>
      </Box>

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={guard.requestClose}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>
          {busy ? t('common.saving') : t('common.save')}
        </Btn>
      </Box>

      {guard.confirm}
    </Modal>
  )
}
