import { useState, useEffect } from 'react'
import { View } from 'react-native'
import { Text, TextInput } from '../components/Text'
import DateField from '../components/DateField'
import { Pressable } from '../components/Pressable'
import { Trash2 } from 'lucide-react-native'
import { PAY_METHODS, payMethodLabel, clientPaymentTargets } from '@simplicity/core'
import Sheet from '../components/Sheet'
import Select from '../components/Select'
import { useFormOptions } from '../lib/formOptions'
import { useDiscardGuard, isDirty } from '../lib/discardGuard'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'

// Add/edit a transaction (mirrors web AddTransactionModal: income/expense +
// amount + date + description + client / "paid for" / category / payment-method
// selects). Pass a `tx` to edit. Invoice-issuing is a later increment; onSave
// gets a transactions-ready payload.
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const blank = (tx, defaults = {}) => ({
  type: tx?.type || defaults.type || 'income',
  amount: tx?.amount != null ? String(tx.amount) : (defaults.amount || ''),
  desc: tx?.desc || defaults.desc || '',
  date: tx?.date ? String(tx.date).slice(0, 10) : todayStr(),
  status: tx?.status || 'confirmed',
  client_id: tx?.client_id || defaults.client_id || '',
  group_id: tx?.group_id || defaults.group_id || '',
  project_id: tx?.project_id || defaults.project_id || '',
  category_id: tx?.category_id || '',
  payment_method: tx?.payment_method || '',
})
// Editable status is offered only in EDIT mode (mirrors web EditTransactionModal);
// on create the status is derived from the date (future → pending, else confirmed).
const STATUS_KEYS = ['confirmed', 'pending', 'skipped']

/* `members` / `groups` feed "עבור מה?" — which of a client's tracks a payment
   was for (transactions.group_id, migration 0115; core clientBalance splits the
   money by it). Callers that know a client's memberships pass them; without
   them the field never shows, exactly as it never shows for a client with a
   single track. */
export default function AddTransactionModal({ open, onClose, onSave, onDelete, tx = null, clients: propClients = [], members = [], groups: propGroups, defaults = {}, onAddCategory }) {
  const isEdit = !!tx
  const { clients: optClients, categories, projects = [], groups: optGroups = [] } = useFormOptions() // categories = the FINANCE `categories` table (expense tags)
  const clients = propClients.length ? propClients : optClients
  const groups = propGroups || optGroups
  const [form, setForm] = useState(() => blank(tx, defaults))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // Inline "new category" creation — only when the parent passes onAddCategory.
  const [creatingCat, setCreatingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [catBusy, setCatBusy] = useState(false)
  /* What a payment was for belongs to the client and to income: another client,
     or turning it into an expense, drops the attribution — otherwise a payment
     re-assigned elsewhere kept counting toward the old client's group dues. */
  const set = (k, v) => setForm((f) => {
    const next = { ...f, [k]: v }
    if ((k === 'client_id' && v !== f.client_id) || (k === 'type' && v !== 'income')) next.group_id = ''
    return next
  })
  useEffect(() => { if (open) { setForm(blank(tx, defaults)); setErr(''); setBusy(false); setCreatingCat(false); setNewCatName(''); setCatBusy(false) } }, [open, tx]) // eslint-disable-line react-hooks/exhaustive-deps

  // Creating a category selects it immediately, so the user never leaves the modal.
  const createCat = async () => {
    const name = newCatName.trim()
    if (!name || !onAddCategory) return
    setCatBusy(true)
    try {
      const row = await onAddCategory(name)
      if (row?.id) set('category_id', row.id)
      setCreatingCat(false); setNewCatName('')
    } catch { /* leave the field open so the user can retry */ } finally { setCatBusy(false) }
  }
  const close = () => { setErr(''); setBusy(false); onClose() }
  // Compared against the seed, so a client or amount the caller pre-filled is not "the user's work".
  const requestClose = useDiscardGuard(!busy && isDirty(form, blank(tx, defaults)), close)

  const remove = async () => {
    if (busy || !onDelete) return
    setBusy(true)
    try { await onDelete(); close() } catch (e) { setBusy(false); setErr(i18n.t('modalsData:common.saveFailed', { error: e.message || i18n.t('modalsData:common.tryAgain') })) }
  }

  /* The tracks this client's money could be going to (core clientPaymentTargets).
     Empty — and the field never renders — for anyone with only one. */
  const payForClient = form.client_id ? clients.find((c) => c.id === form.client_id) : null
  const payFor = clientPaymentTargets(payForClient, members, groups)
  const payForOptions = payFor.map((o) => (o.kind === 'personal'
    ? { value: '', label: i18n.t('modalsData:tx.paidForPersonal') }
    : { value: o.id, label: o.name }))

  const submit = async () => {
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) { setErr(i18n.t('modalsData:common.amountPositive')); return }
    // Guard the free-text date so a blank/malformed value can't reach the DB
    // (web validates the date field; mobile uses a plain TextInput).
    if (!form.date || Number.isNaN(new Date(`${form.date}T00:00:00`).getTime())) { setErr(i18n.t('modalsData:editTx.needDate', { defaultValue: 'יש לבחור תאריך תקין.' })); return }
    setBusy(true)
    setErr('')
    const isFuture = form.date > todayStr()
    const desc = form.desc.trim() || (form.type === 'income' ? i18n.t('modalsData:tx.incomeFallback') : i18n.t('modalsData:tx.expenseFallback'))
    try {
      const clientId = form.client_id || null
      const categoryId = form.type === 'expense' ? (form.category_id || null) : null
      const paymentMethod = form.payment_method || null
      const projectId = form.project_id || null
      // Same write as web: only income is ever "for" a track.
      const groupId = form.type === 'income' ? (form.group_id || null) : null
      const payload = isEdit
        ? { amount, type: form.type, desc, date: form.date, status: form.status, client_id: clientId, group_id: groupId, project_id: projectId, category_id: categoryId, payment_method: paymentMethod }
        : {
          amount, type: form.type, desc, date: form.date,
          status: isFuture ? 'pending' : 'confirmed',
          project_id: projectId, client_id: clientId, group_id: groupId, category_id: categoryId,
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
    <Sheet open={open} onClose={requestClose} title={isEdit ? (tx.desc?.trim() || i18n.t('modalsData:tx.titleNew')) : i18n.t('modalsData:tx.titleNew')}>
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
            accessibilityLabel={i18n.t('modalsData:common.amount')}
          />
        </View>
        <View style={styles.fieldFlex}>
          <Text style={styles.label}>{i18n.t('modalsData:common.date')}</Text>
          <DateField clearable={false} style={styles.input} value={form.date} onChange={(v) => set('date', v)} />
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
      {/* What the payment was for — right under the client it belongs to, and
          only when that client has more than one track to pay toward. */}
      {payFor.length > 0 && form.type === 'income' ? (
        <Select
          label={i18n.t('modalsData:tx.paidFor')}
          value={form.group_id}
          onChange={(v) => set('group_id', v)}
          options={payForOptions}
        />
      ) : null}
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
        creatingCat ? (
          <View style={styles.field}>
            <Text style={styles.label}>{i18n.t('modalsData:common.category')}</Text>
            <View style={styles.catCreateRow}>
              <TextInput style={[styles.input, styles.catInput]} value={newCatName} onChangeText={setNewCatName} placeholder={i18n.t('modalsData:tx.newCatPlaceholder')} placeholderTextColor={colors.textFaint} onSubmitEditing={createCat} autoFocus />
              <Pressable style={[styles.catAdd, (catBusy || !newCatName.trim()) && styles.saveOff]} onPress={createCat} disabled={catBusy || !newCatName.trim()}><Text style={styles.catAddText}>{catBusy ? '…' : i18n.t('modalsData:common.add')}</Text></Pressable>
              <Pressable style={styles.catCancel} onPress={() => { setCreatingCat(false); setNewCatName('') }}><Text style={styles.cancelText}>{i18n.t('modalsData:common.cancel')}</Text></Pressable>
            </View>
          </View>
        ) : (
          <Select
            label={i18n.t('modalsData:common.category')}
            value={form.category_id}
            onChange={(v) => { if (v === '__new__') { setCreatingCat(true); return } set('category_id', v) }}
            placeholder={i18n.t('modalsData:common.noCategory')}
            options={[{ value: '', label: i18n.t('modalsData:common.noCategory') }, ...categories.map((c) => ({ value: c.id, label: c.name || '' })), ...(onAddCategory ? [{ value: '__new__', label: i18n.t('modalsData:tx.newCatOption') }] : [])]}
          />
        )
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
          <Pressable accessibilityLabel={i18n.t('modalsData:editTx.delete')} style={styles.delete} onPress={remove} disabled={busy} hitSlop={6}>
            <Trash2 size={18} strokeWidth={1.8} color={colors.danger} />
          </Pressable>
        ) : null}
        <Pressable style={styles.cancel} onPress={requestClose}><Text style={styles.cancelText}>{i18n.t('modalsData:common.cancel')}</Text></Pressable>
        <Pressable style={[styles.save, busy && styles.saveOff]} onPress={submit} disabled={busy}>
          <Text style={styles.saveText}>{busy ? i18n.t('modalsData:common.saving') : i18n.t('modalsData:common.save')}</Text>
        </Pressable>
      </View>
    </Sheet>
  )
}

const styles = themed((c, t) => ({
  pills: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, paddingVertical: 11, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardFlat, alignItems: 'center' },
  pillIncome: { backgroundColor: c.positive, borderColor: c.positive },
  pillExpense: { backgroundColor: c.danger, borderColor: c.danger },
  pillText: { fontSize: 14, color: c.text },
  pillTextOn: { color: c.onBrand, fontWeight: '600' },
  row2: { flexDirection: 'row', gap: 12 },
  field: { gap: 6 },
  fieldFlex: { flex: 1, gap: 6 },
  label: { fontSize: 13, color: c.textSub },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: c.text, backgroundColor: c.card },
  inputErr: { borderColor: c.danger },
  hint: { fontSize: 12, color: c.textFaint, marginTop: -8 },
  catCreateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catInput: { flex: 1 },
  catAdd: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: 12, backgroundColor: c.btnBg, alignItems: 'center' },
  catAddText: { fontSize: 14, fontWeight: '600', color: c.onBtn },
  catCancel: { paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
  statusPills: { flexDirection: 'row', gap: 8 },
  statusPill: { flex: 1, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardFlat, alignItems: 'center' },
  statusPillOn: { backgroundColor: c.brand, borderColor: c.brand },
  statusPillText: { fontSize: 13, color: c.textSub },
  statusPillTextOn: { color: c.onBrand, fontWeight: '600' },
  error: { color: c.danger, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  delete: { width: 46, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: c.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: c.btnBg, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: c.onBtn },
}))
