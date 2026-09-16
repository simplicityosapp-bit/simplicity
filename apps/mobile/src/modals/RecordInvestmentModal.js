import { useState, useEffect } from 'react'
import { View } from 'react-native'
import { isr, fmtMonthYear } from '@simplicity/core'
import { Text } from '../components/Text'
import { Pressable } from '../components/Pressable'
import DateField from '../components/DateField'
import Sheet from '../components/Sheet'
import { localDateString } from '../lib/investments'
import i18n from '../lib/i18n'
import { themed } from '../theme/themed'

const t = (k, o) => i18n.t(`finance:investment.${k}`, o)

/* Which date does this investment land on? (web RecordInvestmentModal)
   Shown only when the finance screen is on a month that is NOT the one in
   progress — there "השקעתי" stays one tap that stamps today. ONE date: the
   expense and the record share it, so they can never disagree about the
   month. Defaults to today (the money moved when it moved); the end of the
   month on screen is one tap away for the other reading. No future dates. */
export default function RecordInvestmentModal({ open, onClose, onConfirm, amount, month }) {
  const today = localDateString()
  const [date, setDate] = useState(today)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setDate(localDateString()); setErr(''); setBusy(false) } }, [open])

  const monthEnd = month ? localDateString(new Date(month.getFullYear(), month.getMonth() + 1, 0)) : null
  const canUseMonthEnd = monthEnd && monthEnd <= today && monthEnd !== date

  const submit = async () => {
    if (busy) return
    if (!date) { setErr(t('recordNeedDate')); return }
    if (date > today) { setErr(t('recordNoFuture')); return }
    setBusy(true); setErr('')
    try {
      await onConfirm(date)
      onClose()
    } catch {
      setBusy(false) // the hook raised its own toast; keep the date
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('recordTitle')}>
      <Text style={styles.sub}>{t('recordAmount', { amount: isr(amount) })}</Text>
      <View style={styles.field}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>{t('recordDateLabel')}</Text>
          {canUseMonthEnd ? (
            <Pressable onPress={() => { setDate(monthEnd); setErr('') }} hitSlop={8} accessibilityRole="button">
              <Text style={styles.link}>{t('recordUseMonthEnd', { month: fmtMonthYear(month) })}</Text>
            </Pressable>
          ) : null}
        </View>
        <DateField clearable={false} style={styles.input} value={date} onChange={(v) => { setDate(v); setErr('') }} />
        <Text style={styles.hint}>{t('recordDateHint')}</Text>
      </View>
      {err ? <Text style={styles.error}>{err}</Text> : null}
      <View style={styles.actions}>
        <Pressable style={styles.cancel} onPress={onClose} disabled={busy}><Text style={styles.cancelText}>{t('recordCancel')}</Text></Pressable>
        <Pressable style={[styles.save, busy && styles.off]} onPress={submit} disabled={busy}>
          <Text style={styles.saveText}>{busy ? t('recordSaving') : t('recordConfirm')}</Text>
        </Pressable>
      </View>
    </Sheet>
  )
}

const styles = themed((c) => ({
  sub: { fontSize: 14, color: c.textSub },
  field: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { fontSize: 13, color: c.textSub },
  link: { fontSize: 13, fontWeight: '600', color: c.brand },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: c.text, backgroundColor: c.card },
  hint: { fontSize: 12, color: c.textFaint },
  error: { color: c.danger, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: c.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: c.btnBg, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '600', color: c.onBtn },
  off: { opacity: 0.5 },
}))
