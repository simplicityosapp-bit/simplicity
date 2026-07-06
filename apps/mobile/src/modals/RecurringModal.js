import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import Sheet from '../components/Sheet'
import Select from '../components/Select'
import { useFormOptions } from '../lib/formOptions'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Add/edit a recurring transaction template (mirrors web RecurringModal's
// schedule path): type · amount · desc · cadence (monthly-date / weekly) + day ·
// until-date · client/project/category · active. The on-meeting trigger is a
// later increment; this creates schedule-based templates.
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const blank = () => ({ type: 'expense', amount: '', desc: '', cadence_type: 'monthly_date', day_of_month: String(new Date().getDate()), day_of_week: '0', until_date: '', client_id: '', project_id: '', category_id: '', active: true })
const fromTemplate = (t) => (t ? {
  type: t.type, amount: String(t.amount ?? ''), desc: t.desc || '',
  cadence_type: t.cadence_type || 'monthly_date',
  day_of_month: String(t.day_of_month ?? 1), day_of_week: String(t.day_of_week ?? 0),
  until_date: t.until_date ? String(t.until_date).slice(0, 10) : '',
  client_id: t.client_id || '', project_id: t.project_id || '', category_id: t.category_id || '', active: t.active !== false,
} : blank())

export default function RecurringModal({ open, onClose, onSave, template = null }) {
  const isEdit = !!template
  const { clients, projects, categories } = useFormOptions()
  const [form, setForm] = useState(() => fromTemplate(template))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  useEffect(() => { if (open) { setForm(fromTemplate(template)); setErr(''); setBusy(false) } }, [open, template]) // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { setErr(''); setBusy(false); onClose() }
  const T = (k, o) => i18n.t(`modalsData:recurring.${k}`, o)
  const C = (k, o) => i18n.t(`modalsData:common.${k}`, o)

  const submit = async () => {
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) { setErr(C('amountPositive')); return }
    if (form.cadence_type === 'monthly_date') {
      const day = parseInt(form.day_of_month, 10)
      if (!day || day < 1 || day > 31) { setErr(T('badDayOfMonth')); return }
    }
    setBusy(true); setErr('')
    try {
      await onSave({
        type: form.type, amount, desc: form.desc.trim() || null,
        trigger_type: 'schedule', cadence_type: form.cadence_type,
        day_of_month: form.cadence_type === 'monthly_date' ? parseInt(form.day_of_month, 10) : null,
        day_of_week: form.cadence_type === 'weekly' ? parseInt(form.day_of_week, 10) : null,
        until_date: form.until_date || null,
        client_id: form.client_id || null, project_id: form.project_id || null,
        category_id: form.type === 'expense' ? (form.category_id || null) : null,
        active: form.active,
      })
      close()
    } catch (e) {
      setBusy(false); setErr(C('saveFailed', { error: e.message || C('tryAgain') }))
    }
  }

  return (
    <Sheet open={open} onClose={close} title={isEdit ? T('titleEdit') : T('titleNew')}>
      <View style={styles.pills}>
        <Pressable style={[styles.pill, form.type === 'income' && styles.pillIncome]} onPress={() => set('type', 'income')}><Text style={[styles.pillText, form.type === 'income' && styles.pillTextOn]}>{C('income')}</Text></Pressable>
        <Pressable style={[styles.pill, form.type === 'expense' && styles.pillExpense]} onPress={() => set('type', 'expense')}><Text style={[styles.pillText, form.type === 'expense' && styles.pillTextOn]}>{C('expense')}</Text></Pressable>
      </View>

      <View style={styles.row2}>
        <View style={styles.fieldFlex}>
          <Text style={styles.label}>{C('amount')}</Text>
          <TextInput style={[styles.input, err && !(parseFloat(form.amount) > 0) && styles.inputErr]} value={form.amount} onChangeText={(v) => { set('amount', v); if (err) setErr('') }} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textFaint} />
        </View>
        <View style={styles.fieldFlex}>
          <Text style={styles.label}>{C('description')}</Text>
          <TextInput style={styles.input} value={form.desc} onChangeText={(v) => set('desc', v)} placeholder={T('descPlaceholder')} placeholderTextColor={colors.textFaint} />
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{T('repeats')}</Text>
        <View style={styles.pills}>
          <Pressable style={[styles.segPill, form.cadence_type === 'monthly_date' && styles.segOn]} onPress={() => set('cadence_type', 'monthly_date')}><Text style={[styles.segText, form.cadence_type === 'monthly_date' && styles.pillTextOn]}>{T('monthly')}</Text></Pressable>
          <Pressable style={[styles.segPill, form.cadence_type === 'weekly' && styles.segOn]} onPress={() => set('cadence_type', 'weekly')}><Text style={[styles.segText, form.cadence_type === 'weekly' && styles.pillTextOn]}>{T('weekly')}</Text></Pressable>
        </View>
      </View>

      <View style={styles.row2}>
        {form.cadence_type === 'monthly_date' ? (
          <View style={styles.fieldFlex}>
            <Text style={styles.label}>{T('dayOfMonth')}</Text>
            <TextInput style={styles.input} value={form.day_of_month} onChangeText={(v) => set('day_of_month', v)} keyboardType="numeric" placeholderTextColor={colors.textFaint} />
          </View>
        ) : (
          <View style={styles.fieldFlex}>
            <Select label={T('dayOfWeek')} value={form.day_of_week} onChange={(v) => set('day_of_week', v)} options={DAY_KEYS.map((k, i) => ({ value: String(i), label: i18n.t(`modalsData:recurring.days.${k}`, { defaultValue: i18n.t(`clients:form.days.${i}`) }) }))} />
          </View>
        )}
        <View style={styles.fieldFlex}>
          <Text style={styles.label}>{T('untilDate')}</Text>
          <TextInput style={styles.input} value={form.until_date} onChangeText={(v) => set('until_date', v)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} />
        </View>
      </View>

      <Select label={T('clientOptional')} value={form.client_id} onChange={(v) => set('client_id', v)} placeholder={C('none')} options={[{ value: '', label: C('none') }, ...clients.map((c) => ({ value: c.id, label: c.name || '' }))]} />
      <Select label={T('projectOptional')} value={form.project_id} onChange={(v) => set('project_id', v)} placeholder={C('none')} options={[{ value: '', label: C('none') }, ...projects.map((p) => ({ value: p.id, label: p.name || '' }))]} />
      {form.type === 'expense' ? (
        <Select label={C('category')} value={form.category_id} onChange={(v) => set('category_id', v)} placeholder={C('noCategory')} options={[{ value: '', label: C('noCategory') }, ...categories.map((c) => ({ value: c.id, label: c.name || '' }))]} />
      ) : null}

      {isEdit ? (
        <Pressable style={styles.activeRow} onPress={() => set('active', !form.active)}>
          <View style={[styles.check, form.active && styles.checkOn]}>{form.active ? <Text style={styles.checkMark}>✓</Text> : null}</View>
          <Text style={styles.activeLabel}>{T('active')}</Text>
        </Pressable>
      ) : null}

      {err ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
        <Pressable style={styles.cancel} onPress={close}><Text style={styles.cancelText}>{C('cancel')}</Text></Pressable>
        <Pressable style={[styles.save, busy && styles.saveOff]} onPress={submit} disabled={busy}><Text style={styles.saveText}>{busy ? C('saving') : C('save')}</Text></Pressable>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, paddingVertical: 11, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat, alignItems: 'center' },
  pillIncome: { backgroundColor: colors.positive, borderColor: colors.positive },
  pillExpense: { backgroundColor: colors.danger, borderColor: colors.danger },
  pillText: { fontSize: 14, color: colors.text },
  pillTextOn: { color: colors.onBrand, fontWeight: '600' },
  segPill: { flex: 1, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat, alignItems: 'center' },
  segOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  segText: { fontSize: 13, color: colors.textSub },
  row2: { flexDirection: 'row', gap: 12 },
  field: { gap: 6 },
  fieldFlex: { flex: 1, gap: 6 },
  label: { fontSize: 13, color: colors.textSub },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  inputErr: { borderColor: colors.danger },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  checkMark: { color: colors.onBrand, fontSize: 13, fontWeight: '700' },
  activeLabel: { fontSize: 14, color: colors.text },
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
})
