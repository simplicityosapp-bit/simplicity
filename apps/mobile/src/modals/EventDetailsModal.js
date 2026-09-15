import { useState, useEffect } from 'react'
import { View, Alert, Linking } from 'react-native'
import { Text, TextInput } from '../components/Text'
import DateField from '../components/DateField'
import { Pressable } from '../components/Pressable'
import { Check, X, Pencil, Trash2, CalendarDays, Clock, CalendarClock } from 'lucide-react-native'
import { formatWhen, fmtTime, isr } from '@simplicity/core'
import Sheet from '../components/Sheet'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'

// Detail + action sheet opened by tapping any calendar row (mirrors web
// EventDetailsModal):
//   · a past pending meeting → did it happen (yes / no), and the per-session
//     charge prompt after a yes;
//   · an upcoming meeting → reschedule or cancel;
//   · a confirmed meeting → delete;
//   · a synced / owned calendar event → edit or delete, plus the booking it
//     came from (who, which page, what they wrote) with cancel;
//   · a lead follow-up → done;
//   · a reminder → mark done or delete.
// The last two used to be rows that could not be tapped at all.
const T = (k, o) => i18n.t(`modalsTask:event.${k}`, o)
const CANCEL = () => i18n.t('modalsData:common.cancel', { defaultValue: 'ביטול' })
const pad = (n) => String(n).padStart(2, '0')
const datePart = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const timePart = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const TIME_RE = /^(\d{1,2}):(\d{2})$/

export default function EventDetailsModal({
  open, onClose, event,
  onConfirmMeeting, onSkipMeeting, onDeleteMeeting, onCancelMeeting, onRescheduleMeeting,
  onUpdateEvent, onDeleteEvent, onCancelBooking,
  onFollowupDone, onCompleteReminder, onRemoveReminder,
  billClient = null, onBillSession,
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ title: '', date: '', start: '', end: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [billStep, setBillStep] = useState(false)  // per-session client: offer a one-off charge after confirm
  /* Reschedule — an inline form on the meeting branch, like the event editor. */
  const [moving, setMoving] = useState(false)
  const [moveForm, setMoveForm] = useState({ date: '', time: '' })
  const [moveErr, setMoveErr] = useState('')
  useEffect(() => { if (open) { setEditing(false); setErr(''); setBusy(false); setBillStep(false); setMoving(false); setMoveErr('') } }, [open, event])

  if (!event) return <Sheet open={open} onClose={onClose} title={T('title')} />

  const isMeeting = event.kind === 'meeting'
  const isCalendar = event.kind === 'calendar'
  const isFollowup = event.kind === 'leadFollowup'
  const isReminder = event.kind === 'reminder'
  const isPast = event.isPast ?? (new Date(event.when).getTime() <= Date.now())
  const Icon = (isMeeting || isCalendar) ? CalendarDays : Clock

  // Runs an action on the row and closes. The screen's handlers report their
  // own failures, so a throw here only has to not escape the press.
  const run = (fn, arg = event.raw) => async () => {
    if (busy) return
    setBusy(true)
    try { await fn?.(arg) } catch { /* surfaced by the handler */ } finally { onClose() }
  }
  const ask = (title, message, confirmText, onConfirm) => Alert.alert(title, message, [
    { text: CANCEL(), style: 'cancel' },
    { text: confirmText, style: 'destructive', onPress: onConfirm },
  ])

  // "Did it happen? → yes". For a per-session client the parent's confirm only
  // flips status (no auto-materialise), then we offer the one-off charge here so
  // the session isn't double-counted. Mirrors web EventDetailsModal billStep.
  const confirmHappened = async () => {
    if (busy) return
    setBusy(true)
    try { await onConfirmMeeting?.(event.raw) } catch { /* parent surfaces errors */ }
    setBusy(false)
    if (billClient) setBillStep(true)
    else onClose()
  }
  const doBill = async () => { if (busy) return; setBusy(true); try { await onBillSession?.(event) } finally { onClose() } }

  const startMove = () => {
    setMoveForm({ date: datePart(event.when), time: timePart(event.when) })
    setMoveErr('')
    setMoving(true)
  }
  /* Kept OPEN on failure: the unique index on (subject, instant) rejects a move
     onto a slot this subject already holds, and the coach needs to see that and
     pick another time — not watch the sheet close on a save that never happened. */
  const saveMove = async () => {
    if (busy) return
    const m = TIME_RE.exec(moveForm.time.trim())
    if (!moveForm.date || !m) { setMoveErr(T('moveRequired')); return }
    const at = new Date(`${moveForm.date}T${pad(Number(m[1]))}:${m[2]}`)
    if (Number.isNaN(at.getTime())) { setMoveErr(T('moveRequired')); return }
    setBusy(true)
    try {
      await onRescheduleMeeting?.(event.raw, at.toISOString())
      onClose()
    } catch {
      setBusy(false)
      setMoveErr(T('moveFailed'))
    }
  }

  const startEdit = () => {
    setForm({ title: event.title || '', date: datePart(event.when), start: timePart(event.when), end: event.end ? timePart(event.end) : '' })
    setErr('')
    setEditing(true)
  }
  const saveEdit = async () => {
    if (!form.date || !form.start) { setErr(T('startRequired')); return }
    setBusy(true)
    const start = new Date(`${form.date}T${form.start}`)
    let endIso = null
    if (form.end) {
      let end = new Date(`${form.date}T${form.end}`)
      // Single date + start/end TIME: an end at or before start rolls to the next
      // day (e.g. 23:00→01:00) — otherwise end_time would land before start_time.
      if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000)
      endIso = end.toISOString()
    }
    // Editing always yields a concrete timed event (start is required), so clear
    // all_day — else a previously all-day (e.g. Google-synced) event keeps
    // all_day=true and the new times are ignored on re-render.
    const patch = { title: form.title.trim() || T('noTitle'), start_time: start.toISOString(), end_time: endIso, all_day: false }
    try { await onUpdateEvent?.(event.raw, patch); onClose() } catch (e) { setBusy(false); setErr(e?.message || T('startRequired')) }
  }

  const booking = isCalendar ? event.booking : null
  const links = isCalendar ? [
    event.clientName && T('linkClient', { name: event.clientName }),
    event.projectName && T('linkProject', { name: event.projectName }),
    event.leadName && T('linkLead', { name: event.leadName }),
    event.groupName && T('linkGroup', { name: event.groupName }),
  ].filter(Boolean) : []

  return (
    <Sheet open={open} onClose={onClose} title={T('title')}>
      {/* Header — icon + title + when */}
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: colors.cardFlat }]}><Icon size={18} strokeWidth={1.6} color={colors.textSub} /></View>
        <View style={styles.headText}>
          <Text style={styles.title} numberOfLines={2}>{event.title || T('fallbackTitle')}</Text>
          <Text style={styles.when}>{event.allDay ? T('allDay') : `${formatWhen(event.when)}${event.end ? `–${fmtTime(event.end)}` : ''}`}</Text>
        </View>
      </View>

      {/* An upcoming meeting is the one a coach most often needs to MOVE or call
          off, and the sheet offered neither — only a line saying it was ahead.
          "Did it happen?" stays for once its time has passed: "yes" creates a
          session and can bill a per-session client. The caller stamps isPast
          when the event is opened; reading the clock here is only the fallback. */}
      {isMeeting && event.status === 'pending' && !isPast && !billStep && !moving ? (
        <View style={styles.block}>
          <Text style={styles.confirmed}>{T('meetingUpcoming')}</Text>
          {onRescheduleMeeting || onCancelMeeting ? (
            <View style={styles.actions}>
              {onRescheduleMeeting ? (
                <Pressable style={[styles.btn, styles.approve]} onPress={startMove} disabled={busy} accessibilityRole="button">
                  <CalendarClock size={15} strokeWidth={2} color={colors.onBrand} /><Text style={styles.approveText}>{T('reschedule')}</Text>
                </Pressable>
              ) : null}
              {onCancelMeeting ? (
                <Pressable
                  style={[styles.btn, styles.skip]}
                  onPress={() => ask(T('cancelMeeting'), T('cancelMeetingConfirm'), T('cancelMeeting'), run(onCancelMeeting))}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <X size={15} strokeWidth={2} color={colors.danger} /><Text style={styles.skipText}>{T('cancelMeeting')}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
      {isMeeting && moving ? (
        <View style={styles.block}>
          <View style={styles.row2}>
            <View style={styles.flex}>
              <Text style={styles.label}>{i18n.t('modalsTask:meeting.date')}</Text>
              <DateField clearable={false} style={styles.input} value={moveForm.date} onChange={(v) => { setMoveForm((f) => ({ ...f, date: v })); if (moveErr) setMoveErr('') }} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.label}>{i18n.t('modalsTask:meeting.time')}</Text>
              <TextInput
                style={styles.input}
                value={moveForm.time}
                onChangeText={(v) => { setMoveForm((f) => ({ ...f, time: v })); if (moveErr) setMoveErr('') }}
                placeholder="09:00"
                placeholderTextColor={colors.textFaint}
                accessibilityLabel={i18n.t('modalsTask:meeting.time')}
              />
            </View>
          </View>
          {moveErr ? <Text style={styles.error}>{moveErr}</Text> : null}
          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.approve]} onPress={saveMove} disabled={busy} accessibilityRole="button">
              <Check size={15} strokeWidth={2} color={colors.onBrand} /><Text style={styles.approveText}>{i18n.t('modalsData:common.save', { defaultValue: 'שמור' })}</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.skip]} onPress={() => setMoving(false)} disabled={busy}>
              <X size={15} strokeWidth={2} color={colors.textSub} /><Text style={styles.skipText}>{CANCEL()}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {isMeeting && event.status === 'pending' && isPast && !billStep ? (
        <View style={styles.block}>
          <Text style={styles.question}>{T('meetingHappened')}</Text>
          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.approve]} onPress={confirmHappened} disabled={busy}>
              <Check size={15} strokeWidth={2} color={colors.onBrand} /><Text style={styles.approveText}>{T('yes')}</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.skip]} onPress={run(onSkipMeeting)} disabled={busy}>
              <X size={15} strokeWidth={2} color={colors.textSub} /><Text style={styles.skipText}>{T('no')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {/* Per-session client → one-off charge prompt after confirm (mirrors web). */}
      {isMeeting && billStep && billClient ? (
        <View style={styles.block}>
          <Text style={styles.question}>
            {billClient.price_per_session > 0
              ? T('billOneOff', { name: billClient.name, amount: isr(billClient.price_per_session) })
              : T('billOneOffNoPrice', { name: billClient.name })}
          </Text>
          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.approve]} onPress={doBill} disabled={busy}>
              <Check size={15} strokeWidth={2} color={colors.onBrand} /><Text style={styles.approveText}>{T('billYes')}</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.skip]} onPress={onClose} disabled={busy}>
              <X size={15} strokeWidth={2} color={colors.textSub} /><Text style={styles.skipText}>{T('billNo')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {isMeeting && event.status === 'confirmed' && !billStep ? (
        <View style={styles.block}>
          <Text style={styles.confirmed}>{T('meetingConfirmed')}</Text>
          {onDeleteMeeting ? (
            <View style={styles.actions}>
              <Pressable style={[styles.btn, styles.skip]} onPress={() => ask(T('deleteMeeting'), T('deleteMeetingConfirm'), T('delete'), run(onDeleteMeeting))} disabled={busy}>
                <Trash2 size={15} strokeWidth={2} color={colors.danger} /><Text style={styles.skipText}>{T('deleteMeeting')}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Booking context — who booked, from which page, what they wrote. The
          phone showed a booked slot as a bare title with nothing to say who
          was coming. */}
      {booking && !editing ? (
        <View style={styles.booking}>
          <Text style={styles.bookingHead}>{T('bookingHeading')}</Text>
          <Text style={styles.bookingRow}>{T('bookingName', { name: booking.name })}</Text>
          {booking.meetingTypeName ? <Text style={styles.bookingRow}>{T('bookingType', { type: booking.meetingTypeName })}</Text> : null}
          <Text style={styles.bookingRow}>{T('bookingFromPage', { page: booking.pageName })}</Text>
          {booking.phone ? (
            <Text style={[styles.bookingRow, styles.link]} onPress={() => Linking.openURL(`tel:${String(booking.phone).replace(/[^\d+]/g, '')}`).catch(() => {})}>
              {T('bookingPhone')}: {booking.phone}
            </Text>
          ) : null}
          {booking.email ? (
            <Text style={[styles.bookingRow, styles.link]} onPress={() => Linking.openURL(`mailto:${booking.email}`).catch(() => {})}>
              {T('bookingEmail')}: {booking.email}
            </Text>
          ) : null}
          {booking.note ? <Text style={styles.bookingRow}>{T('bookingNote', { note: booking.note })}</Text> : null}
          {onCancelBooking && booking.id ? (
            <Pressable
              style={[styles.btn, styles.skip, styles.bookingCancel]}
              onPress={() => ask(T('cancelBooking'), T('cancelBookingConfirm'), T('cancelBooking'), run(onCancelBooking, event))}
              disabled={busy}
              accessibilityRole="button"
            >
              <X size={15} strokeWidth={2} color={colors.danger} /><Text style={styles.skipText}>{T('cancelBooking')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Calendar event — what it is linked to, whose it is, then edit / delete */}
      {isCalendar && !editing ? (
        <>
          <Text style={styles.status}>
            {links.length ? `${links.join(' · ')} · ` : ''}
            {event.raw?.owned ? T('ownedEvent') : T('googleEvent')}
          </Text>
          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.approve]} onPress={startEdit} disabled={busy}>
              <Pencil size={15} strokeWidth={2} color={colors.onBrand} /><Text style={styles.approveText}>{T('edit')}</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.skip]} onPress={() => ask(T('title'), T('deleteConfirm'), T('delete'), run(onDeleteEvent))} disabled={busy}>
              <Trash2 size={15} strokeWidth={2} color={colors.danger} /><Text style={styles.skipText}>{T('delete')}</Text>
            </Pressable>
          </View>
        </>
      ) : null}
      {isCalendar && editing ? (
        <View style={styles.block}>
          <View style={styles.field}>
            <Text style={styles.label}>{T('eventTitle')}</Text>
            <TextInput style={styles.input} value={form.title} onChangeText={(v) => setForm((f) => ({ ...f, title: v }))} placeholder={T('eventTitlePlaceholder')} placeholderTextColor={colors.textFaint} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>{i18n.t('modalsData:common.date', { defaultValue: 'תאריך' })}</Text>
            <DateField clearable={false} style={styles.input} value={form.date} onChange={(v) => { setForm((f) => ({ ...f, date: v })); if (err) setErr('') }} />
          </View>
          <View style={styles.row2}>
            <View style={styles.flex}>
              <Text style={styles.label}>{T('start')}</Text>
              <TextInput style={styles.input} value={form.start} onChangeText={(v) => { setForm((f) => ({ ...f, start: v })); if (err) setErr('') }} placeholder="09:00" placeholderTextColor={colors.textFaint} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.label}>{T('end')}</Text>
              <TextInput style={styles.input} value={form.end} onChangeText={(v) => setForm((f) => ({ ...f, end: v }))} placeholder="10:00" placeholderTextColor={colors.textFaint} />
            </View>
          </View>
          {err ? <Text style={styles.error}>{err}</Text> : null}
          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.approve]} onPress={saveEdit} disabled={busy}>
              <Check size={15} strokeWidth={2} color={colors.onBrand} /><Text style={styles.approveText}>{i18n.t('modalsData:common.save', { defaultValue: 'שמור' })}</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.skip]} onPress={() => setEditing(false)} disabled={busy}>
              <X size={15} strokeWidth={2} color={colors.textSub} /><Text style={styles.skipText}>{CANCEL()}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Lead follow-up → done (clears the date; the lead stays on its board). */}
      {isFollowup ? (
        <View style={styles.block}>
          <Text style={styles.status}>{T('followupStatus', { title: event.title })}</Text>
          {onFollowupDone ? (
            <View style={styles.actions}>
              <Pressable style={[styles.btn, styles.approve]} onPress={run(onFollowupDone)} disabled={busy} accessibilityRole="button">
                <Check size={15} strokeWidth={2} color={colors.onBrand} /><Text style={styles.approveText}>{T('followupDone')}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Reminder → mark done (a recurring one advances) / delete. */}
      {isReminder && (onCompleteReminder || onRemoveReminder) ? (
        <View style={styles.actions}>
          {onCompleteReminder ? (
            <Pressable style={[styles.btn, styles.approve]} onPress={run(onCompleteReminder)} disabled={busy} accessibilityRole="button">
              <Check size={15} strokeWidth={2} color={colors.onBrand} /><Text style={styles.approveText}>{T('markDone')}</Text>
            </Pressable>
          ) : null}
          {onRemoveReminder ? (
            <Pressable style={[styles.btn, styles.skip]} onPress={() => ask(T('title'), T('deleteConfirm'), T('delete'), run(onRemoveReminder))} disabled={busy} accessibilityRole="button">
              <Trash2 size={15} strokeWidth={2} color={colors.danger} /><Text style={styles.skipText}>{T('delete')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  )
}

const styles = themed((c, t) => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 16, fontWeight: '600', color: c.text },
  when: { fontSize: 13, color: c.textSub },
  block: { gap: 10, marginTop: 6 },
  question: { fontSize: 14, color: c.text },
  confirmed: { fontSize: 14, color: c.positive, marginTop: 8 },
  status: { fontSize: 13, color: c.textSub, lineHeight: 19, marginTop: 4 },
  field: { gap: 6 },
  row2: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1, gap: 6 },
  label: { fontSize: 13, color: c.textSub },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: c.text, backgroundColor: c.card },
  error: { color: c.danger, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12 },
  approve: { backgroundColor: c.brand },
  approveText: { fontSize: 15, fontWeight: '600', color: c.onBrand },
  skip: { borderWidth: 1, borderColor: c.border },
  skipText: { fontSize: 15, color: c.textSub },
  booking: { gap: 4, marginTop: 6, padding: 12, borderRadius: 12, backgroundColor: c.cardFlat },
  bookingHead: { fontSize: 13, fontWeight: '600', color: c.text, marginBottom: 2 },
  bookingRow: { fontSize: 13, color: c.textSub, lineHeight: 19 },
  link: { color: c.brand },
  bookingCancel: { flex: 0, marginTop: 8, paddingHorizontal: 16 },
}))
