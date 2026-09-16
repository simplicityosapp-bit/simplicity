import { useState, useEffect } from 'react'
import { View } from 'react-native'
import { Text, TextInput } from '../components/Text'
import DateField from '../components/DateField'
import { Pressable } from '../components/Pressable'
import { Trash2 } from 'lucide-react-native'
import { nextWeeklyOccurrence, nextMonthlyOccurrence, weekdayNamesShort } from '@simplicity/core'
import Sheet from '../components/Sheet'
import Select from '../components/Select'
import { useFormOptions } from '../lib/formOptions'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'

// Add/edit a reminder (mirrors web AddReminderModal). Pass a `reminder` to edit it
// (prefills + shows delete).
//
// Recurrence is chosen FIRST and the timing field follows it, as on web: a
// weekday for weekly, a day of the month for monthly, a start date for every-X
// and for a one-off. The first occurrence of a weekly or monthly reminder is the
// NEXT future one (core nextWeeklyOccurrence / nextMonthlyOccurrence). This
// screen used to read the weekday from a date field defaulting to today and save
// that date as-is, so a reminder made after its hour was overdue on arrival and
// one given a past date came back counting ×N.
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const RECUR = [
  { k: 'none', l: 'recOnce' },
  { k: 'weekly', l: 'recWeekly' },
  { k: 'monthly_date', l: 'recMonthly' },
  { k: 'every_x_days', l: 'recEveryX' },
]
const HEB_DAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
const dayLabels = () => {
  const names = weekdayNamesShort()
  return Array.isArray(names) && names.length === 7 ? names : HEB_DAYS_SHORT
}
// `prefill` seeds a NEW reminder ({ title, description, date, time }) without
// putting the sheet into edit mode.
const fromReminder = (r, prefill = null) => {
  const now = new Date()
  if (!r) {
    return {
      title: prefill?.title || '', description: prefill?.description || '', date: prefill?.date || todayStr(), time: prefill?.time || '09:00',
      recurrence: 'none', interval: '2',
      day_of_week: String(now.getDay()), day_of_month: String(now.getDate()),
      client_id: '', category_id: '', end_date: '',
    }
  }
  const d = r.scheduled_at ? new Date(r.scheduled_at) : now
  const pad = (n) => String(n).padStart(2, '0')
  return {
    title: r.title || '',
    description: r.description || '',
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    recurrence: r.recurrence_type || 'none',
    interval: String(r.recurrence_pattern?.x ?? 2),
    day_of_week: String(r.recurrence_pattern?.dayOfWeek ?? d.getDay()),
    day_of_month: String(r.recurrence_pattern?.dayOfMonth ?? d.getDate()),
    client_id: (r.linked_to_type === 'client' && r.linked_to_id) ? r.linked_to_id : '',
    category_id: r.category_id || '',
    end_date: r.end_date || '',
  }
}

/* `linkedTo` ({ type, id }) binds a new reminder to something other than a
   client — the investment row passes { type: 'investment' } — and shows
   `linkedSubjectName` in place of the client picker, as on web. A reminder
   already linked that way keeps its link when edited here; the phone used to
   write linked_to_type null for anything without a client. */
export default function AddReminderModal({ open, onClose, onSave, onDelete, reminder = null, linkedTo = null, linkedSubjectName = '', prefill = null }) {
  const isEdit = !!reminder
  const fixedLink = linkedTo || (reminder?.linked_to_type && reminder.linked_to_type !== 'client'
    ? { type: reminder.linked_to_type, id: reminder.linked_to_id || null }
    : null)
  const { clients = [], taskCategories = [] } = useFormOptions()
  const [form, setForm] = useState(() => fromReminder(reminder, prefill))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  useEffect(() => { if (open) { setForm(fromReminder(reminder, prefill)); setErr(''); setBusy(false) } }, [open, reminder]) // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { setErr(''); setBusy(false); onClose() }

  const remove = async () => {
    if (busy || !onDelete) return
    setBusy(true)
    try { await onDelete(); close() } catch (e) { setBusy(false); setErr(i18n.t('modalsTask:common.saveFailed', { error: e.message || i18n.t('modalsTask:common.tryAgain') })) }
  }

  const submit = async () => {
    if (!form.title.trim()) { setErr(i18n.t('modalsTask:reminder.titleRequired')); return }
    if (!form.time) { setErr(i18n.t('modalsTask:reminder.timeRequired')); return }

    // Pattern KEYS must match what core/reminders.ts reads: dayOfWeek / dayOfMonth / x.
    let scheduled
    let rec
    if (form.recurrence === 'weekly') {
      const dow = Number(form.day_of_week)
      scheduled = nextWeeklyOccurrence(dow, form.time)
      rec = { recurrence_type: 'weekly', recurrence_pattern: { dayOfWeek: dow } }
    } else if (form.recurrence === 'monthly_date') {
      const dom = parseInt(form.day_of_month, 10)
      if (!dom || dom < 1 || dom > 31) { setErr(i18n.t('modalsTask:reminder.dayOfMonthRange')); return }
      scheduled = nextMonthlyOccurrence(dom, form.time)
      rec = { recurrence_type: 'monthly_date', recurrence_pattern: { dayOfMonth: dom } }
    } else if (form.recurrence === 'every_x_days') {
      const x = parseInt(form.interval, 10)
      if (!x || x < 1) { setErr(i18n.t('modalsTask:reminder.everyXPositive')); return }
      scheduled = new Date(`${form.date}T${form.time}`)
      rec = { recurrence_type: 'every_x_days', recurrence_pattern: { x } }
    } else {
      scheduled = new Date(`${form.date}T${form.time}`)
      rec = { recurrence_type: 'none', recurrence_pattern: null }
    }
    if (Number.isNaN(scheduled.getTime())) { setErr(i18n.t('modalsTask:reminder.invalidDateTime')); return }
    // An end date only applies to a recurring reminder, and can't precede the first occurrence.
    const hasEnd = form.recurrence !== 'none' && form.end_date
    if (hasEnd && new Date(`${form.end_date}T23:59:59`) < scheduled) { setErr(i18n.t('modalsTask:reminder.endBeforeFirst')); return }
    setBusy(true)
    setErr('')
    try {
      // On edit, if the user didn't change the timing, keep the ORIGINAL
      // scheduled_at + pattern: an overdue recurring reminder must stay overdue,
      // and a clamped monthly one (the 31st, anchored to Feb-28) must not be
      // rewritten. Mirrors web AddReminderModal.
      let scheduledAt = scheduled.toISOString()
      let recPattern = rec.recurrence_pattern
      if (isEdit && reminder?.scheduled_at && form.recurrence !== 'none') {
        const orig = fromReminder(reminder)
        const timingUnchanged = form.recurrence === orig.recurrence && form.time === orig.time
          && (form.recurrence !== 'weekly' || form.day_of_week === orig.day_of_week)
          && (form.recurrence !== 'monthly_date' || form.day_of_month === orig.day_of_month)
          && (form.recurrence !== 'every_x_days' || (form.interval === orig.interval && form.date === orig.date))
        if (timingUnchanged) {
          scheduledAt = reminder.scheduled_at
          if (reminder.recurrence_pattern) recPattern = reminder.recurrence_pattern
        }
      }
      const common = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        scheduled_at: scheduledAt,
        end_date: hasEnd ? form.end_date : null,
        linked_to_type: fixedLink ? fixedLink.type : (form.client_id ? 'client' : null),
        linked_to_id: fixedLink ? fixedLink.id : (form.client_id || null),
        category_id: form.category_id || null,
        ...rec,
        recurrence_pattern: recPattern,
      }
      await onSave(isEdit ? common : { ...common, status: 'pending', type: null, channel: null })
      close()
    } catch (e) {
      setBusy(false)
      setErr(i18n.t('modalsTask:common.saveFailed', { error: e.message || i18n.t('modalsTask:common.tryAgain') }))
    }
  }

  const timeField = (
    <View style={styles.fieldFlex}>
      <Text style={styles.label}>{i18n.t('modalsTask:reminder.time')}</Text>
      <TextInput style={styles.input} value={form.time} onChangeText={(v) => set('time', v)} placeholder="09:00" placeholderTextColor={colors.textFaint} />
    </View>
  )

  return (
    <Sheet open={open} onClose={close} title={isEdit ? i18n.t('modalsTask:reminder.titleEdit', { defaultValue: i18n.t('modalsTask:reminder.titleNew') }) : i18n.t('modalsTask:reminder.titleNew')}>
      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsTask:reminder.what')}</Text>
        <TextInput
          style={[styles.input, err && !form.title.trim() && styles.inputErr]}
          value={form.title}
          onChangeText={(v) => { set('title', v); if (err) setErr('') }}
          placeholder={i18n.t('modalsTask:reminder.titlePlaceholder')}
          placeholderTextColor={colors.textFaint}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsTask:reminder.recurrence')}</Text>
        <View style={styles.pills}>
          {RECUR.map((r) => {
            const on = form.recurrence === r.k
            return (
              <Pressable key={r.k} style={[styles.pill, on && styles.pillOn]} onPress={() => set('recurrence', r.k)} accessibilityState={{ selected: on }}>
                <Text style={[styles.pillText, on && styles.pillTextOn]}>{i18n.t(`modalsTask:reminder.${r.l}`)}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {/* The timing field follows the recurrence, so a weekly reminder is never
          asked for a calendar date. */}
      {form.recurrence === 'weekly' ? (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>{i18n.t('modalsTask:reminder.dayOfWeek')}</Text>
            <View style={styles.pills}>
              {dayLabels().map((d, i) => {
                const on = Number(form.day_of_week) === i
                return (
                  <Pressable key={i} style={[styles.pill, on && styles.pillOn]} onPress={() => set('day_of_week', String(i))} accessibilityState={{ selected: on }}>
                    <Text style={[styles.pillText, on && styles.pillTextOn]}>{d}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
          <View style={styles.row2}>{timeField}</View>
        </>
      ) : form.recurrence === 'monthly_date' ? (
        <View style={styles.row2}>
          <View style={styles.fieldFlex}>
            <Text style={styles.label}>{i18n.t('modalsTask:reminder.dayOfMonth')}</Text>
            <TextInput style={styles.input} value={form.day_of_month} onChangeText={(v) => { set('day_of_month', v); if (err) setErr('') }} keyboardType="numeric" placeholderTextColor={colors.textFaint} />
          </View>
          {timeField}
        </View>
      ) : (
        <View style={styles.row2}>
          <View style={styles.fieldFlex}>
            <Text style={styles.label}>{form.recurrence === 'every_x_days' ? i18n.t('modalsTask:reminder.startFrom') : i18n.t('modalsTask:reminder.date')}</Text>
            <DateField clearable={false} style={styles.input} value={form.date} onChange={(v) => set('date', v)} />
          </View>
          {timeField}
        </View>
      )}

      {form.recurrence === 'every_x_days' ? (
        <View style={styles.field}>
          <Text style={styles.label}>{i18n.t('modalsTask:reminder.everyHowMany', { defaultValue: 'כל כמה ימים' })}</Text>
          <TextInput style={styles.input} value={form.interval} onChangeText={(v) => { set('interval', v); if (err) setErr('') }} keyboardType="numeric" placeholderTextColor={colors.textFaint} />
        </View>
      ) : null}
      {form.recurrence !== 'none' ? (
        <View style={styles.field}>
          <Text style={styles.label}>{i18n.t('modalsTask:reminder.endDate', { defaultValue: 'תאריך סיום (אופציונלי)' })}</Text>
          <DateField style={styles.input} value={form.end_date} onChange={(v) => set('end_date', v)} />
        </View>
      ) : null}

      {fixedLink ? (
        <View style={styles.field}>
          <Text style={styles.label}>{i18n.t('modalsTask:reminder.linkedTo')}</Text>
          <Text style={styles.linkedSubject}>{linkedSubjectName || (fixedLink.type === 'project' ? i18n.t('modalsTask:reminder.project') : fixedLink.type)}</Text>
        </View>
      ) : (
        <Select
          label={i18n.t('modalsTask:reminder.linkedClient', { defaultValue: 'לקוח מקושר (אופציונלי)' })}
          value={form.client_id}
          onChange={(v) => set('client_id', v)}
          placeholder={i18n.t('modalsTask:common.none')}
          options={[{ value: '', label: i18n.t('modalsTask:common.none') }, ...clients.map((c) => ({ value: c.id, label: c.name || '' }))]}
        />
      )}
      {taskCategories.length ? (
        <Select
          label={i18n.t('modalsTask:reminder.category', { defaultValue: 'קטגוריה (אופציונלי)' })}
          value={form.category_id}
          onChange={(v) => set('category_id', v)}
          placeholder={i18n.t('modalsTask:common.none')}
          options={[{ value: '', label: i18n.t('modalsTask:common.none') }, ...taskCategories.map((c) => ({ value: c.id, label: c.name || '' }))]}
        />
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsTask:reminder.details')}</Text>
        <TextInput style={[styles.input, { minHeight: 72, paddingTop: 11 }]} value={form.description} onChangeText={(v) => set('description', v)} placeholder={i18n.t('modalsTask:reminder.detailsPlaceholder')} placeholderTextColor={colors.textFaint} multiline textAlignVertical="top" />
      </View>

      {err ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
        {isEdit && onDelete ? (
          <Pressable accessibilityLabel={i18n.t('modalsData:editTx.delete')} style={styles.delete} onPress={remove} disabled={busy} hitSlop={6}><Trash2 size={18} strokeWidth={1.8} color={colors.danger} /></Pressable>
        ) : null}
        <Pressable style={styles.cancel} onPress={close}><Text style={styles.cancelText}>{i18n.t('modalsTask:common.cancel')}</Text></Pressable>
        <Pressable style={[styles.save, busy && styles.saveOff]} onPress={submit} disabled={busy}>
          <Text style={styles.saveText}>{busy ? i18n.t('modalsTask:common.saving') : i18n.t('modalsTask:common.save')}</Text>
        </Pressable>
      </View>
    </Sheet>
  )
}

const styles = themed((c, t) => ({
  linkedSubject: { fontSize: 15, color: c.text, paddingVertical: 4 },
  row2: { flexDirection: 'row', gap: 12 },
  field: { gap: 6 },
  fieldFlex: { flex: 1, gap: 6 },
  label: { fontSize: 13, color: c.textSub },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: c.text, backgroundColor: c.card },
  inputErr: { borderColor: c.danger },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { minHeight: 44, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardFlat },
  pillOn: { backgroundColor: c.brand, borderColor: c.brand },
  pillText: { fontSize: 13, color: c.textSub },
  pillTextOn: { color: c.onBrand, fontWeight: '600' },
  error: { color: c.danger, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  delete: { width: 46, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: c.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: c.btnBg, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: c.onBtn },
}))
