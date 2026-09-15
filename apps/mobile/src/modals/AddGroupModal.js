import { useState, useEffect } from 'react'
import { View } from 'react-native'
import { Text, TextInput } from '../components/Text'
import { Pressable } from '../components/Pressable'
import { Trash2 } from 'lucide-react-native'
import Sheet from '../components/Sheet'
import Select from '../components/Select'
import DateField from '../components/DateField'
import { useDiscardGuard, isDirty } from '../lib/discardGuard'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'

// Add/edit a group under a project (mirrors web AddGroupModal / EditGroupModal):
// name + color + billing (package price/sessions, per-session, or none) + the
// group's weekly slot (day, start/end time, optional start/end dates), which the
// meetings engine builds the calendar series from. Pass a `group` to edit it.
// Deleting hands off to the parent, which asks what to do with the members,
// meetings, sessions and reminders (DeleteGroupModal).
const SWATCHES = ['#0e9888', '#0099aa', '#7a5cb8', '#8BA888', '#C97B5E', '#D4A574', '#B5634E', '#4a9a6a']
const DAYS = [0, 1, 2, 3, 4, 5, 6]
const C = (k, o) => i18n.t(`modalsClient:common.${k}`, o)
const G = (k, o) => i18n.t(`modalsClient:addGroup.${k}`, o)
const E = (k, o) => i18n.t(`modalsClient:editGroup.${k}`, o)
const TIME_RE = /^\d{1,2}:\d{2}$/
const blank = (group) => ({
  name: group?.name || '',
  color: group?.color || SWATCHES[0],
  billing_mode: group?.billing_mode || (group?.price_per_session != null ? 'per_session' : 'package'),
  package_price: group?.package_price != null ? String(group.package_price) : '',
  package_sessions: group?.package_sessions != null ? String(group.package_sessions) : '',
  price_per_session: group?.price_per_session != null ? String(group.price_per_session) : '',
  recurring_day: group?.recurring_day != null ? String(group.recurring_day) : '',
  recurring_time: group?.recurring_time ? String(group.recurring_time).slice(0, 5) : '',
  recurring_end_time: group?.recurring_end_time ? String(group.recurring_end_time).slice(0, 5) : '',
  recurring_start_date: group?.recurring_start_date || '',
  recurring_end_date: group?.recurring_end_date || '',
})

export default function AddGroupModal({ open, onClose, onSave, onDelete, group = null, project }) {
  const isEdit = !!group
  const [form, setForm] = useState(() => blank(group))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  useEffect(() => { if (open) { setForm(blank(group)); setErr(''); setBusy(false) } }, [open, group])
  const close = () => { setErr(''); setBusy(false); onClose() }
  const requestClose = useDiscardGuard(!busy && isDirty(form, blank(group)), close)
  const isPer = form.billing_mode === 'per_session'
  const hasDay = form.recurring_day !== ''

  const submit = async () => {
    if (!form.name.trim()) { setErr(C('nameRequired')); return }
    const price = parseFloat(form.package_price)
    const sess = parseInt(form.package_sessions, 10)
    const perSession = parseFloat(form.price_per_session)
    if (form.billing_mode === 'package') {
      if (!(price > 0)) { setErr(G('errPackagePrice', { defaultValue: 'יש למלא מחיר חבילה חיובי.' })); return }
      if (!(sess > 0)) { setErr(G('errSessions', { defaultValue: 'יש למלא מספר פגישות חיובי.' })); return }
    } else if (isPer && !(perSession > 0)) { setErr(G('errPerSession', { defaultValue: 'יש למלא מחיר לפגישה חיובי.' })); return }
    /* A weekly slot needs a start time to generate anything; a time typed
       without the H:MM shape would be stored and never match a meeting. */
    if (hasDay && !TIME_RE.test(form.recurring_time.trim())) { setErr(i18n.t('modalsTask:meeting.dateTimeRequired')); return }
    if (form.recurring_end_time && !TIME_RE.test(form.recurring_end_time.trim())) { setErr(i18n.t('modalsTask:meeting.dateTimeRequired')); return }
    setBusy(true)
    setErr('')
    try {
      const payload = {
        name: form.name.trim(), color: form.color, billing_mode: form.billing_mode,
        package_price: form.billing_mode === 'package' ? price : null,
        package_sessions: form.billing_mode === 'package' ? sess : null,
        price_per_session: isPer ? perSession : null,
        // No day → no slot: the times and dates clear with it (web EditGroupModal).
        recurring_day: hasDay ? Number(form.recurring_day) : null,
        recurring_time: hasDay ? form.recurring_time.trim().padStart(5, '0') : null,
        recurring_end_time: hasDay && form.recurring_end_time ? form.recurring_end_time.trim().padStart(5, '0') : null,
        recurring_start_date: hasDay ? (form.recurring_start_date || null) : null,
        recurring_end_date: hasDay ? (form.recurring_end_date || null) : null,
      }
      await onSave(isEdit ? payload : { ...payload, project_id: project?.id || null, status: 'active' })
      close()
    } catch (e) {
      setBusy(false)
      setErr(C('saveFailed', { error: e.message || C('tryAgain') }))
    }
  }

  return (
    <Sheet open={open} onClose={requestClose} title={isEdit ? E('title', { defaultValue: 'עריכת קבוצה' }) : G('title', { defaultValue: 'קבוצה חדשה' })}>
      <View style={styles.field}>
        <Text style={styles.label}>{G('groupName', { defaultValue: 'שם הקבוצה' })}</Text>
        <TextInput style={[styles.input, err && !form.name.trim() && styles.inputErr]} value={form.name} onChangeText={(v) => { set('name', v); if (err) setErr('') }} placeholder={G('groupNamePlaceholder')} placeholderTextColor={colors.textFaint} />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{C('color')}</Text>
        <View style={styles.swatches}>
          {SWATCHES.map((c) => <Pressable key={c} style={[styles.swatch, { backgroundColor: c }, form.color === c && styles.swatchOn]} onPress={() => set('color', c)} />)}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{G('pricing', { defaultValue: 'תמחור' })}</Text>
        <View style={styles.pills}>
          {[{ k: 'package', l: 'editClient.billingPackage' }, { k: 'per_session', l: 'editClient.billingPerSession' }, { k: 'none', l: 'common.none' }].map((m) => {
            const on = form.billing_mode === m.k
            return (
              <Pressable key={m.k} style={[styles.pill, on && styles.pillOn]} onPress={() => { set('billing_mode', m.k); if (err) setErr('') }}>
                <Text style={[styles.pillText, on && styles.pillTextOn]} numberOfLines={1}>{i18n.t(`modalsClient:${m.l}`)}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {isPer ? (
        <View style={styles.field}>
          <Text style={styles.label}>{G('pricePerSession', { defaultValue: 'מחיר לפגישה ₪' })}</Text>
          <TextInput style={styles.input} value={form.price_per_session} onChangeText={(v) => set('price_per_session', v)} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textFaint} />
        </View>
      ) : form.billing_mode === 'none' ? (
        <Text style={styles.hint}>{G('noneHint', { defaultValue: 'בלי מחיר קבוע מראש. אפשר לתמחר כל חבר בנפרד דרך כרטיס הלקוח.' })}</Text>
      ) : (
        <View style={styles.row2}>
          <View style={styles.flex}>
            <Text style={styles.label}>{G('packagePrice', { defaultValue: 'מחיר חבילה ₪' })}</Text>
            <TextInput style={styles.input} value={form.package_price} onChangeText={(v) => set('package_price', v)} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textFaint} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.label}>{G('sessionCount', { defaultValue: 'מספר פגישות' })}</Text>
            <TextInput style={styles.input} value={form.package_sessions} onChangeText={(v) => set('package_sessions', v)} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textFaint} />
          </View>
        </View>
      )}

      {/* The group's weekly slot. The phone could not set one, so a group made
          here never reached the calendar until someone opened the web app. */}
      <Select
        label={E('fixedDay')}
        value={form.recurring_day}
        onChange={(v) => { set('recurring_day', v); if (err) setErr('') }}
        placeholder={C('none')}
        options={[{ value: '', label: C('none') }, ...DAYS.map((d) => ({ value: String(d), label: C(`day${d}`) }))]}
      />
      {hasDay ? (
        <>
          <View style={styles.row2}>
            <View style={styles.flex}>
              <Text style={styles.label}>{E('startTime')}</Text>
              <TextInput style={styles.input} value={form.recurring_time} onChangeText={(v) => { set('recurring_time', v); if (err) setErr('') }} placeholder="18:00" placeholderTextColor={colors.textFaint} accessibilityLabel={E('startTime')} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.label}>{E('endTime')}</Text>
              <TextInput style={styles.input} value={form.recurring_end_time} onChangeText={(v) => set('recurring_end_time', v)} placeholder="19:30" placeholderTextColor={colors.textFaint} accessibilityLabel={E('endTime')} />
            </View>
          </View>
          <View style={styles.row2}>
            <View style={styles.flex}>
              <Text style={styles.label}>{E('startDateOptional')}</Text>
              <DateField style={styles.input} value={form.recurring_start_date} onChange={(v) => set('recurring_start_date', v)} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.label}>{E('endDateOptional')}</Text>
              <DateField style={styles.input} value={form.recurring_end_date} onChange={(v) => set('recurring_end_date', v)} />
            </View>
          </View>
        </>
      ) : null}

      {err ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
        {isEdit && onDelete ? <Pressable accessibilityLabel={E('deleteGroup')} style={styles.delete} onPress={() => { if (!busy) onDelete() }} disabled={busy} hitSlop={6}><Trash2 size={18} strokeWidth={1.8} color={colors.danger} /></Pressable> : null}
        <Pressable style={styles.cancel} onPress={requestClose}><Text style={styles.cancelText}>{C('cancel')}</Text></Pressable>
        <Pressable style={[styles.save, busy && styles.saveOff]} onPress={submit} disabled={busy}><Text style={styles.saveText}>{busy ? C('saving') : C('save')}</Text></Pressable>
      </View>
    </Sheet>
  )
}

const styles = themed((c, t) => ({
  field: { gap: 6 },
  row2: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1, gap: 6 },
  label: { fontSize: 13, color: c.textSub },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: c.text, backgroundColor: c.card },
  inputErr: { borderColor: c.danger },
  hint: { fontSize: 12, color: c.textFaint, lineHeight: 16 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: c.text },
  pills: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardFlat, alignItems: 'center' },
  pillOn: { backgroundColor: c.brand, borderColor: c.brand },
  pillText: { fontSize: 14, color: c.text },
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
