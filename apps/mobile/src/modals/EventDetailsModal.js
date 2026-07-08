import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native'
import { Check, X, Pencil, Trash2, CalendarDays, Clock } from 'lucide-react-native'
import { formatWhen, fmtTime } from '@simplicity/core'
import Sheet from '../components/Sheet'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Detail + action sheet opened by tapping a calendar agenda row (mirrors web
// EventDetailsModal). A pending meeting → confirm ("happened") / skip ("didn't");
// a synced calendar_event → edit (title / day / start+end time = reschedule) or
// delete. Reminders + lead follow-ups are actioned on their own screens, so the
// sheet just shows their detail. Google-synced events are CLAIMED on edit/delete
// (owned=true, handled by the hook) so the change survives future syncs.
const T = (k, o) => i18n.t(`modalsTask:event.${k}`, o)
const pad = (n) => String(n).padStart(2, '0')
const datePart = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const timePart = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}` }

export default function EventDetailsModal({ open, onClose, event, onConfirmMeeting, onSkipMeeting, onUpdateEvent, onDeleteEvent }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ title: '', date: '', start: '', end: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setEditing(false); setErr(''); setBusy(false) } }, [open, event])

  if (!event) return <Sheet open={open} onClose={onClose} title={T('title')} />

  const isMeeting = event.kind === 'meeting'
  const isCalendar = event.kind === 'calendar'
  const Icon = (isMeeting || isCalendar) ? CalendarDays : Clock

  const run = (fn) => async () => { if (busy) return; setBusy(true); try { await fn?.(event.raw) } finally { onClose() } }

  const startEdit = () => {
    setForm({ title: event.title || '', date: datePart(event.when), start: timePart(event.when), end: event.end ? timePart(event.end) : '' })
    setErr('')
    setEditing(true)
  }
  const saveEdit = async () => {
    if (!form.date || !form.start) { setErr(T('startRequired')); return }
    setBusy(true)
    const startIso = new Date(`${form.date}T${form.start}`).toISOString()
    const endIso = form.end ? new Date(`${form.date}T${form.end}`).toISOString() : null
    const patch = { title: form.title.trim() || T('noTitle'), start_time: startIso, end_time: endIso }
    try { await onUpdateEvent?.(event.raw, patch); onClose() } catch (e) { setBusy(false); setErr(e?.message || T('startRequired')) }
  }
  const confirmDelete = () => {
    Alert.alert(T('title'), T('deleteConfirm'), [
      { text: i18n.t('modalsData:common.cancel', { defaultValue: 'ביטול' }), style: 'cancel' },
      { text: T('delete'), style: 'destructive', onPress: run(onDeleteEvent) },
    ])
  }

  return (
    <Sheet open={open} onClose={onClose} title={T('title')}>
      {/* Header — icon + title + when */}
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: colors.cardFlat }]}><Icon size={18} strokeWidth={1.6} color={colors.textSub} /></View>
        <View style={styles.headText}>
          <Text style={styles.title} numberOfLines={2}>{event.title || T('fallbackTitle')}</Text>
          <Text style={styles.when}>{formatWhen(event.when)}{event.end ? `–${fmtTime(event.end)}` : ''}</Text>
        </View>
      </View>

      {/* Meeting — confirm it happened / skip */}
      {isMeeting && event.status === 'pending' ? (
        <View style={styles.block}>
          <Text style={styles.question}>{T('meetingHappened')}</Text>
          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.approve]} onPress={run(onConfirmMeeting)} disabled={busy}>
              <Check size={15} strokeWidth={2} color={colors.onBrand} /><Text style={styles.approveText}>{T('yes')}</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.skip]} onPress={run(onSkipMeeting)} disabled={busy}>
              <X size={15} strokeWidth={2} color={colors.textSub} /><Text style={styles.skipText}>{T('no')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {isMeeting && event.status === 'confirmed' ? (
        <Text style={styles.confirmed}>{T('meetingConfirmed')}</Text>
      ) : null}

      {/* Calendar event — edit (reschedule) / delete */}
      {isCalendar && !editing ? (
        <View style={styles.actions}>
          <Pressable style={[styles.btn, styles.approve]} onPress={startEdit} disabled={busy}>
            <Pencil size={15} strokeWidth={2} color={colors.onBrand} /><Text style={styles.approveText}>{T('edit')}</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.skip]} onPress={confirmDelete} disabled={busy}>
            <Trash2 size={15} strokeWidth={2} color={colors.danger} /><Text style={styles.skipText}>{T('delete')}</Text>
          </Pressable>
        </View>
      ) : null}
      {isCalendar && editing ? (
        <View style={styles.block}>
          <View style={styles.field}>
            <Text style={styles.label}>{T('eventTitle')}</Text>
            <TextInput style={styles.input} value={form.title} onChangeText={(v) => setForm((f) => ({ ...f, title: v }))} placeholder={T('eventTitlePlaceholder')} placeholderTextColor={colors.textFaint} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>{i18n.t('modalsData:common.date', { defaultValue: 'תאריך' })}</Text>
            <TextInput style={styles.input} value={form.date} onChangeText={(v) => { setForm((f) => ({ ...f, date: v })); if (err) setErr('') }} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} />
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
              <X size={15} strokeWidth={2} color={colors.textSub} /><Text style={styles.skipText}>{i18n.t('modalsData:common.cancel', { defaultValue: 'ביטול' })}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  when: { fontSize: 13, color: colors.textSub },
  block: { gap: 10, marginTop: 6 },
  question: { fontSize: 14, color: colors.text },
  confirmed: { fontSize: 14, color: colors.positive, marginTop: 8 },
  field: { gap: 6 },
  row2: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1, gap: 6 },
  label: { fontSize: 13, color: colors.textSub },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12 },
  approve: { backgroundColor: colors.brand },
  approveText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
  skip: { borderWidth: 1, borderColor: colors.border },
  skipText: { fontSize: 15, color: colors.textSub },
})
