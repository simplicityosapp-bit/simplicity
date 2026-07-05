import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import Sheet from '../components/Sheet'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Quick-add a transaction (mirrors web AddTransactionModal's core: income/expense
// + amount + date + description). Client/project/category/payment selects and
// invoice-issuing are a later increment; onSave gets a transactions-ready row.
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const blank = () => ({ type: 'income', amount: '', desc: '', date: todayStr() })

export default function AddTransactionModal({ open, onClose, onSave }) {
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) { setErr(i18n.t('modalsData:common.amountPositive')); return }
    setBusy(true)
    setErr('')
    const isFuture = form.date > todayStr()
    try {
      await onSave({
        amount,
        type: form.type,
        desc: form.desc.trim() || (form.type === 'income' ? i18n.t('modalsData:tx.incomeFallback') : i18n.t('modalsData:tx.expenseFallback')),
        date: form.date,
        status: isFuture ? 'pending' : 'confirmed',
        project_id: null,
        client_id: null,
        category_id: null,
        payment_method: null,
        recurring_id: null,
        orphaned_from: null,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr(i18n.t('modalsData:common.saveFailed', { error: e.message || i18n.t('modalsData:common.tryAgain') }))
    }
  }

  const amountInvalid = !!err && !(parseFloat(form.amount) > 0)

  return (
    <Sheet open={open} onClose={close} title={i18n.t('modalsData:tx.titleNew')}>
      <View style={styles.pills}>
        <Pressable style={[styles.pill, form.type === 'income' && styles.pillIncome]} onPress={() => set('type', 'income')}>
          <Text style={[styles.pillText, form.type === 'income' && styles.pillTextOn]}>{i18n.t('modalsData:common.income')}</Text>
        </Pressable>
        <Pressable style={[styles.pill, form.type === 'expense' && styles.pillExpense]} onPress={() => set('type', 'expense')}>
          <Text style={[styles.pillText, form.type === 'expense' && styles.pillTextOn]}>{i18n.t('modalsData:common.expense')}</Text>
        </Pressable>
      </View>

      <View style={styles.row2}>
        <View style={styles.fieldFlex}>
          <Text style={styles.label}>{i18n.t('modalsData:common.amount')}</Text>
          <TextInput
            style={[styles.input, amountInvalid && styles.inputErr]}
            value={form.amount}
            onChangeText={(v) => { set('amount', v); if (err) setErr('') }}
            placeholder="0"
            placeholderTextColor={colors.textFaint}
            keyboardType="numeric"
          />
        </View>
        <View style={styles.fieldFlex}>
          <Text style={styles.label}>{i18n.t('modalsData:common.date')}</Text>
          <TextInput style={styles.input} value={form.date} onChangeText={(v) => set('date', v)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} />
        </View>
      </View>
      {form.date > todayStr() ? <Text style={styles.hint}>{i18n.t('modalsData:tx.futureHint')}</Text> : null}

      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsData:common.description')}</Text>
        <TextInput style={styles.input} value={form.desc} onChangeText={(v) => set('desc', v)} placeholder={i18n.t('modalsData:tx.descPlaceholder')} placeholderTextColor={colors.textFaint} />
      </View>

      {err ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
        <Pressable style={styles.cancel} onPress={close}><Text style={styles.cancelText}>{i18n.t('modalsData:common.cancel')}</Text></Pressable>
        <Pressable style={[styles.save, busy && styles.saveOff]} onPress={submit} disabled={busy}>
          <Text style={styles.saveText}>{busy ? i18n.t('modalsData:common.saving') : i18n.t('modalsData:common.save')}</Text>
        </Pressable>
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
  row2: { flexDirection: 'row', gap: 12 },
  field: { gap: 6 },
  fieldFlex: { flex: 1, gap: 6 },
  label: { fontSize: 13, color: colors.textSub },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  inputErr: { borderColor: colors.danger },
  hint: { fontSize: 12, color: colors.textFaint, marginTop: -8 },
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
})
