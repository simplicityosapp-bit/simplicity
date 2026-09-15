import { useEffect, useState } from 'react'
import { View, Alert, Platform } from 'react-native'
import { isr } from '@simplicity/core'
import Sheet from '../components/Sheet'
import { Text, TextInput } from '../components/Text'
import { Pressable } from '../components/Pressable'
import { ADJUSTMENT_REASONS } from '../lib/clientAdjustments'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'

/* ════════════════════════════════════════════════════════════════
   AdjustmentModal — fix the numbers on a client's card, and say why.
   ════════════════════════════════════════════════════════════════
   Port of web's AdjustmentModal, both modes:

   • EDIT (the card's «התאמה» link): the hero's figures — meetings, paid,
     balance — opened up. A reason is asked only for the figure that moved.
   • REASON (opened by a «שולם»/«יתרה» edit in the client form, which hands
     over the signed delta): the number is typed already; only the why is
     missing, and backing out discards it, so the exit asks first.

   The reason decides which figure moves, so nobody has to know a discount
   lowers «יתרה» while cash in hand raises «שולם»:
     הנחה → balance · תיקון ייבוא / תשלום שלא נרשם → paid.
   A row explains one figure, so changing both writes two rows.

   The phone had none of this: a «שולם» edit asked "record income or only on
   the card?", a «יתרה» edit wrote the column silently, and the ledger that
   web renders under payments could not be seen, added to or corrected here.
   ════════════════════════════════════════════════════════════════ */
const t = (k, o) => i18n.t(`clients:${k}`, o)
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const PAID_REASONS = ADJUSTMENT_REASONS.filter((r) => r.kind === 'paid')
// Signed money: the minus has to be reachable on the keyboard.
const SIGNED_KEYBOARD = Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'

export default function AdjustmentModal(props) {
  return props.presetAmount != null ? <ReasonOnlySheet {...props} /> : <EditSheet {...props} />
}

function Pills({ options, value, onPick }) {
  return (
    <View style={styles.pills}>
      {options.map((r) => {
        const on = value === r.k
        return (
          <Pressable key={r.k} style={[styles.pill, on && styles.pillOn]} onPress={() => onPick(r.k)} accessibilityState={{ selected: on }}>
            <Text style={[styles.pillText, on && styles.pillTextOn]}>{t(r.labelKey)}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function Actions({ busy, onCancel, onSave }) {
  return (
    <View style={styles.actions}>
      <Pressable style={styles.cancel} onPress={onCancel} disabled={busy}><Text style={styles.cancelText}>{t('inline.cancel')}</Text></Pressable>
      <Pressable style={[styles.save, busy && styles.off]} onPress={onSave} disabled={busy} accessibilityRole="button">
        <Text style={styles.saveText}>{busy ? t('inline.saving') : t('inline.save')}</Text>
      </Pressable>
    </View>
  )
}

/* ── EDIT — the card's numbers, opened up ── */
function EditSheet({ open, onClose, client, balance, onSave, onSaveClient, onAlsoRecordIncome }) {
  const paid0 = balance?.paid ?? 0
  const balance0 = balance?.balance ?? 0
  const adj0 = balance?.adjustment ?? 0
  const memberTotal = balance?.memberTotal ?? 0
  const held = balance?.personalHeld ?? 0
  const perSession = !!balance?.perSession
  const start = () => ({ scheduled: String(balance?.personalQuota ?? 0), done: String(balance?.personalDone ?? 0), paid: String(paid0) })

  const [form, setForm] = useState(start)
  // Extra forgiveness on top of the balance_adjustment the client already has;
  // «יתרה» is DERIVED, so it is held as a delta rather than an absolute.
  const [forgive, setForgive] = useState(0)
  const [balanceDraft, setBalanceDraft] = useState(null)
  const [paidReason, setPaidReason] = useState('unrecorded_payment')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!open) return
    setForm(start()); setForgive(0); setBalanceDraft(null); setPaidReason('unrecorded_payment'); setNote(''); setBusy(false); setErr('')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); if (err) setErr('') }

  const scheduledNext = num(form.scheduled)
  const doneNext = num(form.done)
  const paidNext = num(form.paid)
  /* Same arithmetic clientBalance runs, recomputed from THIS form — editing
     the meeting counts really re-bills the client. */
  const override = client?.total_override
  const privateTotal = override != null && override !== ''
    ? Number(override)
    : (perSession ? doneNext : scheduledNext) * (client?.price_per_session || 0)
  const totalNext = memberTotal + privateTotal
  const balanceNext = totalNext - paidNext - (adj0 + forgive)
  /* Held as raw text while typing: "-" and the "." of "150.5" are not numbers
     yet, and feeding them back through the derived value would erase them. */
  const onBalanceInput = (v) => {
    setBalanceDraft(v)
    if (v !== '' && Number.isFinite(Number(v))) setForgive(totalNext - paidNext - adj0 - Number(v))
    if (err) setErr('')
  }

  const paidDelta = paidNext - paid0
  const sessionsChanged = scheduledNext !== (balance?.personalQuota ?? 0)
  const doneChanged = doneNext !== (balance?.personalDone ?? 0)
  const dirty = paidDelta !== 0 || forgive !== 0 || sessionsChanged || doneChanged

  const submit = async () => {
    if (busy) return
    if (!dirty) { setErr(t('adjust.nothingChanged')); return }
    setBusy(true)
    setErr('')
    try {
      /* Meetings are not money: no reason, straight onto the client row. «בוצעו»
         stores the gap against what was actually logged. */
      const patch = {}
      if (sessionsChanged) patch.sessions = scheduledNext
      if (doneChanged) patch.sessions_done_adjustment = doneNext - held
      if (Object.keys(patch).length) await onSaveClient?.(patch)
      if (paidDelta !== 0) await onSave({ kind: 'paid', reason: paidReason, amount: paidDelta, note: note.trim() || null })
      if (forgive !== 0) await onSave({ kind: 'balance', reason: 'discount', amount: forgive, note: note.trim() || null })
      onClose()
    } catch {
      setBusy(false)
      setErr(t('adjust.saveFailed'))
    }
  }

  /* Book it as real income INSTEAD — never as well: clientBalance sums real
     income and paid_adjustment, so both would count the shekel twice. */
  const canRecordIncome = paidDelta > 0 && paidReason === 'unrecorded_payment'

  return (
    <Sheet open={open} onClose={onClose} title={t('adjust.title')}>
      <Text style={styles.hint}>{t('adjust.intro')}</Text>

      {balance?.hasPersonal ? (
        <View style={styles.field}>
          <Text style={styles.label}>{t('adjust.sessionsHeading')}</Text>
          <View style={styles.cells}>
            <Cell label={t('adjust.scheduled')} value={form.scheduled} onChange={(v) => set('scheduled', v)} keyboardType="number-pad" />
            <Cell label={t('adjust.done')} value={form.done} onChange={(v) => set('done', v)} keyboardType="number-pad" divided />
          </View>
          {doneChanged ? (
            <Text style={styles.hint}>{t('adjust.doneGap', { held, delta: doneNext - held > 0 ? `+${doneNext - held}` : String(doneNext - held) })}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>{t('adjust.moneyHeading')}</Text>
        <View style={styles.cells}>
          <Cell label={t('adjust.paid')} value={form.paid} onChange={(v) => set('paid', v)} keyboardType={SIGNED_KEYBOARD} currency />
          <Cell
            label={t('adjust.balance')}
            value={balanceDraft ?? String(Math.round(balanceNext * 100) / 100)}
            onChange={onBalanceInput}
            onBlur={() => setBalanceDraft(null)}
            keyboardType={SIGNED_KEYBOARD}
            currency
            divided
          />
        </View>
        <Text style={styles.hint}>{t('adjust.totalHint', { total: isr(totalNext) })}</Text>
      </View>

      {paidDelta !== 0 ? (
        <View style={styles.field}>
          <Text style={styles.label}>{t('adjust.whyPaid')}</Text>
          <Pills options={PAID_REASONS} value={paidReason} onPick={setPaidReason} />
        </View>
      ) : null}
      {forgive !== 0 ? <Text style={styles.hint}>{t('adjust.balanceIsDiscount')}</Text> : null}

      {dirty ? (
        <View style={styles.field}>
          <Text style={styles.label}>{t('adjust.note')}</Text>
          <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder={t('adjust.notePlaceholder')} placeholderTextColor={colors.textFaint} accessibilityLabel={t('adjust.note')} />
        </View>
      ) : null}

      {dirty ? (
        <View style={styles.preview}>
          {sessionsChanged || doneChanged ? (
            <Text style={styles.previewLine}>{t('adjust.previewSessions', { from: `${balance?.personalDone ?? 0}/${balance?.personalQuota ?? 0}`, to: `${doneNext}/${scheduledNext}` })}</Text>
          ) : null}
          {paidDelta !== 0 ? <Text style={styles.previewLine}>{t('adjust.previewPaid', { from: isr(paid0), to: isr(paidNext) })}</Text> : null}
          {balanceNext !== balance0 ? <Text style={styles.previewLine}>{t('adjust.previewBalance', { from: isr(balance0), to: isr(balanceNext) })}</Text> : null}
        </View>
      ) : null}

      <Text style={styles.hint}>{t('adjust.notInReports')}</Text>
      {err ? <Text style={styles.error}>{err}</Text> : null}
      <Actions busy={busy} onCancel={onClose} onSave={submit} />
      {canRecordIncome ? (
        <Pressable style={styles.income} onPress={() => { if (!busy) onAlsoRecordIncome?.(paidDelta, note.trim() || null) }} accessibilityRole="button">
          <Text style={styles.incomeText}>{t('adjust.alsoRecordIncome')}</Text>
        </Pressable>
      ) : null}
    </Sheet>
  )
}

/* ── REASON — the number is typed already; only the why is missing ── */
function ReasonOnlySheet({ open, onClose, balance, onSave, onAlsoRecordIncome, presetAmount, presetReason, moreQueued }) {
  const [reason, setReason] = useState(presetReason || 'discount')
  // SIGNED: lowering «שולם» from 500 to 300 hands over −200, and that sign stays.
  const [amount, setAmount] = useState(String(presetAmount))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!open) return
    setReason(presetReason || 'discount'); setAmount(String(presetAmount)); setNote(''); setBusy(false); setErr('')
  }, [open, presetAmount, presetReason])

  const picked = ADJUSTMENT_REASONS.find((r) => r.k === reason) || ADJUSTMENT_REASONS[0]
  const delta = num(amount)
  const paidNow = balance?.paid ?? 0
  const balanceNow = balance?.balance ?? 0
  const paidNext = picked.kind === 'paid' ? paidNow + delta : paidNow
  const balanceNext = balanceNow - delta

  /* The edit that opened this sheet was not written yet — it waits on this
     reason. Backing out throws away a number typed on a screen that has
     already closed, so the exits ask. */
  const requestClose = () => {
    if (busy) return
    Alert.alert(i18n.t('modalsSystem:discard.title'), t('adjust.cancelDiscards'), [
      { text: i18n.t('modalsSystem:discard.cancel'), style: 'cancel' },
      { text: i18n.t('modalsSystem:discard.confirm'), style: 'destructive', onPress: onClose },
    ])
  }

  const submit = async () => {
    if (busy) return
    if (!delta) { setErr(t('adjust.amountRequired')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({ kind: picked.kind, reason: picked.k, amount: delta, note: note.trim() || null })
      onClose()
    } catch {
      setBusy(false)
      setErr(t('adjust.saveFailed'))
    }
  }

  return (
    <Sheet open={open} onClose={requestClose} title={t('adjust.title')}>
      <View style={styles.field}>
        <Text style={styles.label}>{t('adjust.whatHappened')}</Text>
        <Pills options={ADJUSTMENT_REASONS} value={reason} onPick={(k) => { setReason(k); if (err) setErr('') }} />
      </View>
      <View style={styles.row2}>
        <View style={styles.flex}>
          <Text style={styles.label}>{t('adjust.amount')}</Text>
          <TextInput style={styles.input} value={amount} onChangeText={(v) => { setAmount(v); if (err) setErr('') }} keyboardType={SIGNED_KEYBOARD} placeholder="0" placeholderTextColor={colors.textFaint} accessibilityLabel={t('adjust.amount')} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.label}>{t('adjust.note')}</Text>
          <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder={t('adjust.notePlaceholder')} placeholderTextColor={colors.textFaint} accessibilityLabel={t('adjust.note')} />
        </View>
      </View>
      <Text style={styles.hint}>{t('adjust.cancelDiscards')}</Text>
      {moreQueued ? <Text style={styles.hint}>{t('adjust.moreQueued')}</Text> : null}
      {delta !== 0 ? (
        <View style={styles.preview}>
          <Text style={styles.previewLine}>{t('adjust.previewPaid', { from: isr(paidNow), to: isr(paidNext) })}</Text>
          <Text style={styles.previewLine}>{t('adjust.previewBalance', { from: isr(balanceNow), to: isr(balanceNext) })}</Text>
        </View>
      ) : null}
      <Text style={styles.hint}>{t('adjust.notInReports')}</Text>
      {err ? <Text style={styles.error}>{err}</Text> : null}
      <Actions busy={busy} onCancel={requestClose} onSave={submit} />
      {picked.k === 'unrecorded_payment' ? (
        <Pressable
          style={styles.income}
          onPress={() => { if (busy) return; if (!delta) { setErr(t('adjust.amountRequired')); return } onAlsoRecordIncome?.(delta, note.trim() || null) }}
          accessibilityRole="button"
        >
          <Text style={styles.incomeText}>{t('adjust.alsoRecordIncome')}</Text>
        </Pressable>
      ) : null}
    </Sheet>
  )
}

function Cell({ label, value, onChange, onBlur, keyboardType, currency, divided }) {
  return (
    <View style={[styles.cell, divided && styles.cellDivided]}>
      <Text style={styles.cellLabel}>{label}</Text>
      <View style={styles.cellMoney}>
        {currency ? <Text style={styles.cellCur}>₪</Text> : null}
        <TextInput style={styles.cellInput} value={value} onChangeText={onChange} onBlur={onBlur} keyboardType={keyboardType} accessibilityLabel={label} />
      </View>
    </View>
  )
}

const styles = themed((c) => ({
  field: { gap: 6 },
  label: { fontSize: 13, color: c.textSub },
  hint: { fontSize: 12, color: c.textSub, lineHeight: 17 },
  error: { fontSize: 13, color: c.danger },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: c.text, backgroundColor: c.card },
  row2: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1, gap: 6 },
  cells: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 4 },
  cellDivided: { borderStartWidth: 1, borderStartColor: c.divider },
  cellLabel: { fontSize: 11, color: c.textSub },
  cellMoney: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cellCur: { fontSize: 15, color: c.textSub },
  cellInput: { minWidth: 70, textAlign: 'center', fontSize: 18, fontWeight: '500', color: c.text, paddingVertical: 4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardFlat },
  pillOn: { backgroundColor: c.brand, borderColor: c.brand },
  pillText: { fontSize: 13, color: c.text },
  pillTextOn: { color: c.onBrand, fontWeight: '600' },
  preview: { gap: 4, padding: 12, borderRadius: 12, backgroundColor: c.cardFlat },
  previewLine: { fontSize: 13, color: c.text },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: c.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: c.btnBg, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '600', color: c.onBtn },
  off: { opacity: 0.5 },
  income: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  incomeText: { fontSize: 14, fontWeight: '600', color: c.brand },
}))
