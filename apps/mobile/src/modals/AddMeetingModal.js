import { useState } from 'react'
import { View } from 'react-native'
import { Text, TextInput } from '../components/Text'
import DateField from '../components/DateField'
import { Pressable } from '../components/Pressable'
import Sheet from '../components/Sheet'
import Select from '../components/Select'
import { useFormOptions } from '../lib/formOptions'
import { useDiscardGuard, isDirty } from '../lib/discardGuard'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'

// Quick-schedule a meeting (mirrors web ScheduleMeetingModal): pick a client —
// or a group, when the caller passes `groups` — plus date, time and length.
// When a single `client` is locked and onSetRecurringSlot is wired, a
// "שעה קבועה" toggle sets the client's weekly recurring slot instead.
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/* The length the calendar assumed when it had nothing to go on, seeded into
   the form so the assumption is a visible, editable number (web does the same). */
const DEFAULT_DURATION_MIN = '60'
const blank = () => ({ subject_type: 'client', client_id: '', group_id: '', date: todayStr(), time: '09:00', duration: DEFAULT_DURATION_MIN })

export default function AddMeetingModal({ open, onClose, onSave, clients: propClients = [], groups = [], client = null, onSetRecurringSlot }) {
  const { clients: optClients } = useFormOptions()
  const clients = propClients.length ? propClients : optClients
  /* Groups are opt-in, as on web: scheduled_meetings has always carried
     subject_type and every reader handles 'group', but nothing on the phone
     could CREATE one. The calendar passes its groups; the home and project
     quick rows keep the client-only form. Deleted groups are never offered. */
  const pickGroups = (groups || []).filter((g) => !g.deleted_at)
  const hasGroups = !client && pickGroups.length > 0
  const [form, setForm] = useState(blank)
  const [recurring, setRecurring] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank()); setRecurring(false); setConfirmReplace(false); setErr(''); setBusy(false); onClose() }
  const requestClose = useDiscardGuard(!busy && (recurring || isDirty(form, blank())), close)

  const canRecur = !!(client && onSetRecurringSlot)
  const slotDow = new Date(`${form.date || todayStr()}T${form.time || '09:00'}`).getDay()
  const hasExistingSlot = !!(client && client.recurring_day != null && client.recurring_time)
  const showReplaceWarning = recurring && confirmReplace && hasExistingSlot
  const isGroup = hasGroups && form.subject_type === 'group'

  const submit = async () => {
    const subjectId = client?.id || (isGroup ? form.group_id : form.client_id)
    if (!subjectId) { setErr(i18n.t(hasGroups ? 'modalsTask:meeting.subjectRequired' : 'modalsTask:meeting.clientRequired')); return }
    const scheduled = new Date(`${form.date}T${form.time || '09:00'}`)
    if (Number.isNaN(scheduled.getTime())) { setErr(i18n.t('modalsTask:meeting.dateTimeRequired')); return }
    setErr('')

    // Recurring path — set the client's weekly slot; the engine builds the series.
    if (recurring && canRecur) {
      if (hasExistingSlot && !confirmReplace) { setConfirmReplace(true); return }
      setBusy(true)
      try {
        await onSetRecurringSlot(subjectId, { recurring_day: slotDow, recurring_time: form.time, recurring_start_date: form.date, recurring_end_date: null })
        close()
      } catch (e) {
        setBusy(false)
        setErr(i18n.t('modalsTask:common.saveFailed', { error: e.message || i18n.t('modalsTask:common.tryAgain') }))
      }
      return
    }

    const duration = Number(form.duration)
    if (!Number.isFinite(duration) || duration <= 0) { setErr(i18n.t('modalsTask:meeting.durationInvalid')); return }
    setBusy(true)
    try {
      await onSave({
        subject_type: isGroup ? 'group' : 'client',
        subject_id: subjectId,
        scheduled_at: scheduled.toISOString(),
        duration_minutes: duration,
        status: 'pending',
        session_id: null,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr(i18n.t('modalsTask:common.saveFailed', { error: e.message || i18n.t('modalsTask:common.tryAgain') }))
    }
  }

  return (
    <Sheet open={open} onClose={requestClose} title={i18n.t('modalsTask:meeting.title')}>
      {client ? (
        <View style={styles.field}>
          <Text style={styles.label}>{i18n.t('modalsTask:meeting.client')}</Text>
          <Text style={styles.lockedClient}>{client.name || ''}</Text>
        </View>
      ) : (
        <>
          {hasGroups ? (
            <View style={styles.field}>
              <Text style={styles.label}>{i18n.t('modalsTask:meeting.subject')}</Text>
              <View style={styles.pills}>
                {['client', 'group'].map((k) => {
                  const on = form.subject_type === k
                  return (
                    <Pressable key={k} style={[styles.pill, on && styles.pillOn]} onPress={() => { set('subject_type', k); if (err) setErr('') }} accessibilityState={{ selected: on }}>
                      <Text style={[styles.pillText, on && styles.pillTextOn]}>{i18n.t(k === 'client' ? 'modalsTask:meeting.clientsGroup' : 'modalsTask:meeting.groupsGroup')}</Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          ) : null}
          {isGroup ? (
            <Select
              value={form.group_id}
              onChange={(v) => { set('group_id', v); if (err) setErr('') }}
              placeholder={i18n.t('modalsTask:meeting.pickSubject')}
              options={pickGroups.map((g) => ({ value: g.id, label: g.name || '' }))}
            />
          ) : (
            <Select
              label={hasGroups ? undefined : i18n.t('modalsTask:meeting.client')}
              value={form.client_id}
              onChange={(v) => { set('client_id', v); if (err) setErr('') }}
              placeholder={i18n.t('modalsTask:meeting.pickClient')}
              options={clients.map((c) => ({ value: c.id, label: c.name || '' }))}
            />
          )}
        </>
      )}

      <View style={styles.row2}>
        <View style={styles.fieldFlex}>
          <Text style={styles.label}>{i18n.t('modalsTask:meeting.date')}</Text>
          <DateField clearable={false} style={styles.input} value={form.date} onChange={(v) => set('date', v)} />
        </View>
        <View style={styles.fieldFlex}>
          <Text style={styles.label}>{i18n.t('modalsTask:meeting.time')}</Text>
          <TextInput style={styles.input} value={form.time} onChangeText={(v) => set('time', v)} placeholder="09:00" placeholderTextColor={colors.textFaint} />
        </View>
      </View>

      {!(recurring && canRecur) ? (
        /* How long. The calendar drew every meeting as the same block because
           the only length it could find belonged to the subject's weekly slot. */
        <View style={styles.field}>
          <Text style={styles.label}>{i18n.t('modalsTask:meeting.duration')}</Text>
          <TextInput
            style={styles.input}
            value={String(form.duration)}
            onChangeText={(v) => { set('duration', v.replace(/[^\d]/g, '')); if (err) setErr('') }}
            keyboardType="number-pad"
            accessibilityLabel={i18n.t('modalsTask:meeting.duration')}
          />
          <Text style={styles.hint}>{i18n.t('modalsTask:meeting.durationHint')}</Text>
        </View>
      ) : null}

      {canRecur ? (
        <View style={styles.field}>
          <View style={styles.pills}>
            <Pressable style={[styles.pill, !recurring && styles.pillOn]} onPress={() => { setRecurring(false); setConfirmReplace(false) }}>
              <Text style={[styles.pillText, !recurring && styles.pillTextOn]}>{i18n.t('modalsTask:meeting.once')}</Text>
            </Pressable>
            <Pressable style={[styles.pill, recurring && styles.pillOn]} onPress={() => setRecurring(true)}>
              <Text style={[styles.pillText, recurring && styles.pillTextOn]}>{i18n.t('modalsTask:meeting.recurring')}</Text>
            </Pressable>
          </View>
          {recurring ? (
            <Text style={styles.hint}>{i18n.t('modalsTask:meeting.recurringHint', { day: i18n.t(`modalsClient:common.day${slotDow}`), time: form.time })}</Text>
          ) : null}
        </View>
      ) : null}
      {showReplaceWarning ? (
        <Text style={styles.warn}>{i18n.t('modalsTask:meeting.replaceWarning', { day: i18n.t(`modalsClient:common.day${client.recurring_day}`), time: client.recurring_time })}</Text>
      ) : null}

      {err ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
        <Pressable style={styles.cancel} onPress={requestClose}><Text style={styles.cancelText}>{i18n.t('modalsTask:common.cancel')}</Text></Pressable>
        <Pressable style={[styles.save, busy && styles.saveOff]} onPress={submit} disabled={busy}>
          <Text style={styles.saveText}>{busy ? i18n.t('modalsTask:common.saving') : (showReplaceWarning ? i18n.t('modalsTask:meeting.replaceConfirm') : i18n.t('modalsTask:common.save'))}</Text>
        </Pressable>
      </View>
    </Sheet>
  )
}

const styles = themed((c, t) => ({
  row2: { flexDirection: 'row', gap: 12 },
  field: { gap: 6 },
  fieldFlex: { flex: 1, gap: 6 },
  label: { fontSize: 13, color: c.textSub },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: c.text, backgroundColor: c.card },
  pills: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, minHeight: 44, justifyContent: 'center', paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardFlat, alignItems: 'center' },
  pillOn: { backgroundColor: c.brand, borderColor: c.brand },
  pillText: { fontSize: 14, color: c.text },
  pillTextOn: { color: c.onBrand, fontWeight: '600' },
  lockedClient: { fontSize: 15, fontWeight: '600', color: c.text, paddingVertical: 4 },
  hint: { fontSize: 12, color: c.textFaint, lineHeight: 16 },
  warn: { fontSize: 12, color: c.danger, lineHeight: 16 },
  error: { color: c.danger, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: c.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: c.btnBg, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: c.onBtn },
}))
