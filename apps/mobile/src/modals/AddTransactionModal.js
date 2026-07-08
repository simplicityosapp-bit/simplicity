import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { Trash2 } from 'lucide-react-native'
import { PAY_METHODS, payMethodLabel } from '@simplicity/core'
import Sheet from '../components/Sheet'
import Select from '../components/Select'
import { useFormOptions } from '../lib/formOptions'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Add/edit a transaction (mirrors web AddTransactionModal: income/expense +
// amount + date + description + client/category/payment-method selects). Pass a
// `tx` to edit. Invoice-issuing is a later increment; onSave gets a
// transactions-ready payload.
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const blank = (tx, defaults = {}) => ({
  type: tx?.type || defaults.type || 'income',
  amount: tx?.amount != null ? String(tx.amount) : '',
  desc: tx?.desc || '',
  date: tx?.date ? String(tx.date).slice(0, 10) : todayStr(),
  status: tx?.status || 'confirmed',
  client_id: tx?.client_id || defaults.client_id || '',
  project_id: tx?.project_id || defaults.project_id || '',
  category_id: tx?.category_id || '',
  payment_method: tx?.payment_method || '',
})
// Editable status is offered only in EDIT mode (mirrors web EditTransactionModal);
// on create the status is derived from the date (future → pending, else confirmed).
const STATUS_KEYS = ['confirmed', 'pending', 'skipped']

export default function AddTransactionModal({ open, onClose, onSave, onDelete, tx = null, clients: propClients = [], defaults = {} }) {
  const isEdit = !!tx
  const { clients: optClients, categories, projects = [] } = useFormOptions() // categories = the FINANCE `categories` table (expense tags)
  const clients = propClients.length ? propClients : optClients
  const [form, setForm] = useState(() => blank(tx, defaults))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  useEffect(() => { if (open) { setForm(blank(tx, defaults)); setErr(''); setBusy(false) } }, [open, tx]) // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { setErr(''); setBusy(false); onClose() }

  const remove = async () => {
    if (busy || !onDelete) return
    setBusy(true)
    try { await onDelete(); close() } catch (e) { setBusy(false); setErr(i18n.t('modalsData:common.saveFailed', { error: e.message || i18n.t('modalsData:common.tryAgain') })) }
  }

  const submit = async () => {
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) { setErr(i18n.t('modalsData:common.amountPositive')); return }
    setBusy(true)
    setErr('')
    const isFuture = form.date > todayStr()
    const desc = form.desc.trim() || (form.type === 'income' ? i18n.t('modalsData:tx.incomeFallback') : i18n.t('modalsData:tx.expenseFallback'))
    try {
      const clientId = form.client_id || null
      const categoryId = form.type === 'expense' ? (form.category_id || null) : null
      const paymentMethod = form.payment_method || null
      const projectId = form.project_id || null
      const payload = isEdit
        ? { amount, type: form.type, desc, date: form.date, status: form.status, client_id: clientId, project_id: projectId, category_id: categoryId, payment_method: paymentMethod }
        : {
          amount, type: form.type, desc, date: form.date,
          status: isFuture ? 'pending' : 'confirmed',
          project_id: projectId, client_id: clientId, category_id: categoryId,
          payment_method: paymentMethod, recurring_id: null, orphaned_from: null,
        }
      await onSave(payload)
      close()
    } catch (e) {
      setBusy(false)
      setErr(i18n.t('modalsData:common.saveFailed', { error: e.message || i18n.t('modalsData:common.tryAgain') }))
    }
  }

  const amountInvalid = !!err && !(parseFloat(form.amount) > 0)

  return (
    <Sheet open={open} onClose={close} title={isEdit ? (tx.desc?.trim() || i18n.t('modalsData:tx.titleNew')) : i18n.t('modalsData:tx.titleNew')}>
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

      <Select
        label={i18n.t('modalsData:common.client')}
        value={form.client_id}
        onChange={(v) => set('client_id', v)}
        placeholder={i18n.t('modalsData:common.none')}
        options={[{ value: '', label: i18n.t('modalsData:common.none') }, ...clients.map((c) => ({ value: c.id, label: c.name || '' }))]}
      />
      {projects.length ? (
        <Select
          label={i18n.t('modalsData:common.project')}
          value={form.project_id}
          onChange={(v) => set('project_id', v)}
          placeholder={i18n.t('modalsData:common.none')}
          options={[{ value: '', label: i18n.t('modalsData:common.none') }, ...projects.map((p) => ({ value: p.id, label: p.name || '' }))]}
        />
      ) : null}

      {form.type === 'expense' ? (
        <Select
          label={i18n.t('modalsData:common.category')}
          value={form.category_id}
          onChange={(v) => set('category_id', v)}
          placeholder={i18n.t('modalsData:common.noCategory')}
          options={[{ value: '', label: i18n.t('modalsData:common.noCategory') }, ...categories.map((c) => ({ value: c.id, label: c.name || '' }))]}
        />
      ) : null}

      <Select
        label={i18n.t('modalsData:tx.paymentMethod')}
        value={form.payment_method}
        onChange={(v) => set('payment_method', v)}
        placeholder={i18n.t('modalsData:tx.paymentMethodNone')}
        options={[{ value: '', label: i18n.t('modalsData:tx.paymentMethodNone') }, ...PAY_METHODS.map((m) => ({ value: m.key, label: payMethodLabel(m.key) }))]}
      />

      {isEdit ? (
        <View style={styles.field}>
          <Text style={styles.label}>{i18n.t('modalsData:editTx.status')}</Text>
          <View style={styles.statusPills}>
            {STATUS_KEYS.map((k) => (
              <Pressable key={k} style={[styles.statusPill, form.status === k && styles.statusPillOn]} onPress={() => set('status', k)}>
                <Text style={[styles.statusPillText, form.status === k && styles.statusPillTextOn]}>
                  {i18n.t(`modalsData:editTx.status${k.charAt(0).toUpperCase()}${k.slice(1)}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {err ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
        {isEdit && onDelete ? (
          <Pressable style={styles.delete} onPress={remove} disabled={busy} hitSlop={6}>
            <Trash2 size={18} strokeWidth={1.8} color={colors.danger} />
          </Pressable>
        ) : null}
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
  statusPills: { flexDirection: 'row', gap: 8 },
  statusPill: { flex: 1, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat, alignItems: 'center' },
  statusPillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  statusPillText: { fontSize: 13, color: colors.textSub },
  statusPillTextOn: { color: colors.onBrand, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  delete: { width: 46, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
})
