import { useState, useMemo, useEffect, useRef } from 'react'
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native'
import { ChevronDown, Plus, Check, RotateCcw, Trash2, CreditCard } from 'lucide-react-native'
import { planInstallments, planBalance, generateInstallments, firstOfNextMonth, fmtShortDate, isr, PAY_METHODS, payMethodLabel } from '@simplicity/core'
import { usePaymentPlans } from '../hooks/usePaymentPlans'
import Card from '../components/Card'
import Select from '../components/Select'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

const T = (k, o) => i18n.t(`clients:plan.${k}`, o)

// Payment plan (פריסת תשלומים) section inside the client drawer — mirrors web's
// PaymentPlanSection. Splits a client's total into installments and tracks which
// were received (each received installment = a linked income transaction, via
// usePaymentPlans). Self-contained: one active plan per client in v1. The web
// per-installment Grow online-pay button is omitted (Grow is disabled).
export default function PaymentPlanSection({ client }) {
  const { plans, installments, loading, createPlan, markReceived, unmarkReceived, removePlan } = usePaymentPlans()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ total: '', count: '3', startDate: firstOfNextMonth() })
  const [receiving, setReceiving] = useState(null) // { id, method }
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  const plan = plans.find((p) => p.client_id === client.id) || null
  const rows = plan ? planInstallments(plan.id, installments) : []
  const bal = plan ? planBalance(plan, rows) : null

  // Auto-open once when a plan is found, so a client with an active plan surfaces
  // it without a manual tap (respects later toggles).
  const autoOpened = useRef(false)
  useEffect(() => { if (plan && !autoOpened.current) { setOpen(true); autoOpened.current = true } }, [plan])

  const preview = useMemo(() => {
    const total = parseFloat(form.total); const count = parseInt(form.count, 10)
    if (!(total > 0) || !(count >= 1)) return null
    const gen = generateInstallments({ total, count, startDate: form.startDate || undefined })
    return { count, first: gen[0].amount, last: gen[gen.length - 1].amount }
  }, [form.total, form.count, form.startDate])

  const submitCreate = async () => {
    const total = parseFloat(form.total); const count = parseInt(form.count, 10)
    if (!(total > 0) || !(count >= 1) || busy) return
    setBusy(true)
    try { await createPlan({ client_id: client.id, project_id: client.project_id || null, total, count, startDate: form.startDate || null }) } finally { setBusy(false) }
  }

  const confirmReceived = async (inst) => {
    if (busy) return
    setBusy(true)
    try {
      await markReceived(inst, { plan, clientName: client.name, date: new Date().toISOString().slice(0, 10), paymentMethod: receiving?.method || null })
      setReceiving(null)
    } finally { setBusy(false) }
  }

  const doDelete = async () => {
    if (busy) return
    setBusy(true)
    try { await removePlan(plan.id); setConfirmDelete(false) } finally { setBusy(false) }
  }

  const headerCount = plan ? `${bal.receivedCount}/${rows.length}` : null

  return (
    <Card padded={false} style={styles.sectionOuter} contentStyle={styles.section}>
      <Pressable style={styles.head} onPress={() => setOpen((o) => !o)}>
        <Text style={styles.title}>{T('title', { defaultValue: 'פריסת תשלומים' })}</Text>
        {headerCount ? <Text style={styles.count}>{headerCount}</Text> : null}
        <View style={{ flex: 1 }} />
        <ChevronDown size={16} strokeWidth={1.6} color={colors.textSub} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </Pressable>

      {open ? (
        <View style={styles.body}>
          {loading ? (
            <Text style={styles.empty}>{T('loading', { defaultValue: 'טוען…' })}</Text>
          ) : plan ? (
            <>
              <View style={styles.summary}>
                <SumCell l={T('total', { defaultValue: 'סה״כ' })} v={isr(bal.total)} />
                <SumCell l={T('received', { defaultValue: 'התקבל' })} v={isr(bal.received)} />
                <SumCell l={T('remaining', { defaultValue: 'נותר' })} v={isr(bal.remaining)} accent={bal.remaining > 0} />
              </View>

              <View style={styles.list}>
                {rows.map((inst) => (
                  <View key={inst.id} style={[styles.inst, inst.received && styles.instPaid]}>
                    <Text style={styles.instNum}>{inst.num}/{plan.num_installments}</Text>
                    <View style={styles.instMid}>
                      <Text style={styles.instAmt}>{isr(inst.amount)}</Text>
                      <Text style={styles.instDate}>
                        {inst.received
                          ? T('receivedOn', { date: fmtShortDate(inst.received_date), method: inst.payment_method ? ` · ${payMethodLabel(inst.payment_method)}` : '' })
                          : T('due', { date: fmtShortDate(inst.due_date) })}
                      </Text>
                    </View>
                    {inst.received ? (
                      <Pressable style={styles.ghostBtn} disabled={busy} onPress={() => unmarkReceived(inst)} hitSlop={6}>
                        <RotateCcw size={13} strokeWidth={1.9} color={colors.textSub} />
                      </Pressable>
                    ) : receiving?.id === inst.id ? null : (
                      <Pressable style={styles.markBtn} disabled={busy} onPress={() => setReceiving({ id: inst.id, method: '' })}>
                        <Check size={13} strokeWidth={2} color={colors.positive} />
                        <Text style={styles.markText}>{T('markReceived', { defaultValue: 'סמן כהתקבל' })}</Text>
                      </Pressable>
                    )}
                    {receiving?.id === inst.id && !inst.received ? (
                      <View style={styles.receiveRow}>
                        <View style={{ flex: 1 }}>
                          <Select
                            value={receiving.method || ''}
                            onChange={(v) => setReceiving({ id: inst.id, method: v })}
                            placeholder={T('methodNone', { defaultValue: 'ללא אמצעי' })}
                            options={PAY_METHODS.map((m) => ({ value: m.key, label: payMethodLabel(m.key) }))}
                          />
                        </View>
                        <Pressable style={styles.primaryBtn} disabled={busy} onPress={() => confirmReceived(inst)}>
                          <Text style={styles.primaryText}>{T('confirmReceived', { defaultValue: 'אישור' })}</Text>
                        </Pressable>
                        <Pressable style={styles.ghostBtn} disabled={busy} onPress={() => setReceiving(null)} hitSlop={6}>
                          <Text style={styles.cancelText}>{T('cancel', { defaultValue: 'ביטול' })}</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>

              {confirmDelete ? (
                <View style={styles.delConfirm}>
                  <Text style={styles.delText}>{T('deleteConfirm', { defaultValue: 'למחוק את התוכנית?' })}</Text>
                  <Pressable style={styles.dangerBtn} disabled={busy} onPress={doDelete}><Text style={styles.dangerText}>{T('delete', { defaultValue: 'מחיקה' })}</Text></Pressable>
                  <Pressable style={styles.ghostBtn} disabled={busy} onPress={() => setConfirmDelete(false)}><Text style={styles.cancelText}>{T('cancel', { defaultValue: 'ביטול' })}</Text></Pressable>
                </View>
              ) : (
                <Pressable style={styles.delBtn} onPress={() => setConfirmDelete(true)}>
                  <Trash2 size={12} strokeWidth={1.7} color={colors.textFaint} />
                  <Text style={styles.delBtnText}>{T('delete', { defaultValue: 'מחיקת התוכנית' })}</Text>
                </Pressable>
              )}
            </>
          ) : (
            <View style={styles.create}>
              <Text style={styles.createIntro}>{T('createIntro', { defaultValue: 'פרוס/י את הסכום למספר תשלומים.' })}</Text>
              <View style={styles.createRow}>
                <View style={styles.field}>
                  <Text style={styles.fieldL}>{T('totalLabel', { defaultValue: 'סכום כולל' })}</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={form.total} placeholder="0" placeholderTextColor={colors.textFaint} onChangeText={(v) => setForm((f) => ({ ...f, total: v }))} />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldL}>{T('countLabel', { defaultValue: 'מספר תשלומים' })}</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={form.count} onChangeText={(v) => setForm((f) => ({ ...f, count: v }))} />
                </View>
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldL}>{T('startLabel', { defaultValue: 'תשלום ראשון' })}</Text>
                <TextInput style={styles.input} value={form.startDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} onChangeText={(v) => setForm((f) => ({ ...f, startDate: v }))} />
              </View>
              {preview ? (
                <Text style={styles.preview}>
                  {isr(preview.first) === isr(preview.last)
                    ? T('previewEven', { count: preview.count, amount: isr(preview.first) })
                    : T('previewUneven', { count: preview.count, amount: isr(preview.first), last: isr(preview.last) })}
                </Text>
              ) : null}
              <Pressable style={[styles.createGo, (busy || !(parseFloat(form.total) > 0)) && styles.createGoOff]} disabled={busy || !(parseFloat(form.total) > 0)} onPress={submitCreate}>
                <Plus size={14} strokeWidth={2} color={colors.onBrand} />
                <Text style={styles.createGoText}>{T('create', { defaultValue: 'יצירת תוכנית' })}</Text>
              </Pressable>
              <View style={styles.createNote}>
                <CreditCard size={12} strokeWidth={1.7} color={colors.textFaint} />
                <Text style={styles.createNoteText}>{T('createNote', { defaultValue: 'סימון תשלום כהתקבל יוסיף הכנסה ליומן.' })}</Text>
              </View>
            </View>
          )}
        </View>
      ) : null}
    </Card>
  )
}

function SumCell({ l, v, accent }) {
  return (
    <View style={styles.sumCell}>
      <Text style={styles.sumL}>{l}</Text>
      <Text style={[styles.sumV, accent && styles.sumAccent]}>{v}</Text>
    </View>
  )
}
SumCell.displayName = 'SumCell'

const styles = StyleSheet.create({
  sectionOuter: { marginBottom: 8 },
  section: {},
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 14 },
  title: { fontSize: 14, fontWeight: '600', color: colors.text },
  count: { fontSize: 11, fontWeight: '500', color: colors.textSub, backgroundColor: colors.fillStrong, borderRadius: 10, paddingVertical: 1, paddingHorizontal: 8, overflow: 'hidden' },
  body: { gap: 12, paddingHorizontal: 14, paddingBottom: 14 },
  empty: { fontSize: 12, color: colors.textFaint },

  summary: { flexDirection: 'row', backgroundColor: colors.cardFlat, borderRadius: 14, paddingVertical: 12 },
  sumCell: { flex: 1, alignItems: 'center', gap: 3 },
  sumL: { fontSize: 10, fontWeight: '500', color: colors.textSub, letterSpacing: 0.3 },
  sumV: { fontSize: 15, fontWeight: '600', color: colors.text },
  sumAccent: { color: colors.brand },

  list: { gap: 8 },
  inst: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  instPaid: { backgroundColor: 'rgba(139,168,136,0.10)', borderColor: 'rgba(139,168,136,0.35)' },
  instNum: { fontSize: 12, fontWeight: '700', color: colors.textSub, width: 34 },
  instMid: { flex: 1, minWidth: 90, gap: 2 },
  instAmt: { fontSize: 14, fontWeight: '600', color: colors.text },
  instDate: { fontSize: 11, color: colors.textFaint },
  markBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(139,168,136,0.4)', backgroundColor: 'rgba(139,168,136,0.10)' },
  markText: { fontSize: 12, color: colors.positive, fontWeight: '500' },
  ghostBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  receiveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', marginTop: 4 },
  primaryBtn: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.brand },
  primaryText: { fontSize: 13, fontWeight: '600', color: colors.onBrand },
  cancelText: { fontSize: 13, color: colors.textSub },

  delConfirm: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  delText: { fontSize: 13, color: colors.text, flex: 1 },
  dangerBtn: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.danger },
  dangerText: { fontSize: 13, fontWeight: '600', color: colors.onBrand },
  delBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  delBtnText: { fontSize: 12, color: colors.textFaint },

  create: { gap: 12 },
  createIntro: { fontSize: 12, color: colors.textSub, lineHeight: 17 },
  createRow: { flexDirection: 'row', gap: 10 },
  field: { flex: 1, gap: 5 },
  fieldL: { fontSize: 12, color: colors.textSub },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, color: colors.text, backgroundColor: colors.card },
  preview: { fontSize: 12, color: colors.brand, fontWeight: '500' },
  createGo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.brand },
  createGoOff: { opacity: 0.45 },
  createGoText: { fontSize: 14, fontWeight: '600', color: colors.onBrand },
  createNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  createNoteText: { fontSize: 11, color: colors.textFaint, flex: 1, lineHeight: 15 },
})
