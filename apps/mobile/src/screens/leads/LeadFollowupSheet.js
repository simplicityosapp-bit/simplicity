import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Check } from 'lucide-react-native'
import { addMonths } from '@simplicity/core'
import Sheet from '../../components/Sheet'
import DateField from '../../components/DateField'
import { Text } from '../../components/Text'
import { Pressable } from '../../components/Pressable'
import i18n from '../../lib/i18n'
import { colors } from '../../theme/theme'
import { themed } from '../../theme/themed'

const t = (k, o) => i18n.t(`leads:followup.${k}`, o)
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d) }

/* ════════════════════════════════════════════════════════════════
   When to chase this lead again — set from the card.
   ════════════════════════════════════════════════════════════════
   Port of web's LeadFollowupModal. follow_up_date drives the attention
   widget, the follow-ups banner and a calendar event, but on the phone the
   card could only SHOW it: changing it meant the whole lead editor, a lot
   of form for one date. Most follow-ups are tomorrow, next week or next
   month, so those are one tap; the picker covers the rest, and a date
   already set can be cleared ("done") from here too.

   Local dates throughout — a UTC round-trip slips the day on an Israeli
   evening, which is exactly when a coach sets these.
   ════════════════════════════════════════════════════════════════ */
export default function LeadFollowupSheet({ open, onClose, lead, onSave }) {
  const [custom, setCustom] = useState('')
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { if (open) { setCustom(''); setPicking(false); setBusy(false); setErr('') } }, [open])

  const commit = async (date) => {
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      await onSave(date)
      onClose()
    } catch (e) {
      setBusy(false)
      setErr(t('saveFailed', { error: e?.message || '' }))
    }
  }

  const presets = [
    { k: 'tomorrow', date: plusDays(1) },
    { k: 'week', date: plusDays(7) },
    { k: 'month', date: addMonths(ymd(new Date()), 1) },
  ]

  return (
    <Sheet open={open} onClose={onClose} title={t('title')}>
      {lead?.name ? <Text style={styles.sub}>{lead.name}</Text> : null}
      <View style={styles.presets}>
        {presets.map((p) => (
          <Pressable key={p.k} style={[styles.preset, busy && styles.off]} disabled={busy} onPress={() => commit(p.date)} accessibilityRole="button">
            <Text style={styles.presetLabel}>{t(p.k)}</Text>
            <Text style={styles.presetDate}>{p.date.slice(8, 10)}/{p.date.slice(5, 7)}</Text>
          </Pressable>
        ))}
      </View>

      {picking ? (
        <View style={styles.custom}>
          <Text style={styles.label}>{t('otherDate')}</Text>
          <DateField style={styles.input} value={custom} onChange={setCustom} />
          <Pressable style={[styles.primary, (busy || !custom) && styles.off]} disabled={busy || !custom} onPress={() => commit(custom)} accessibilityRole="button">
            <Text style={styles.primaryText}>{t('setIt')}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setPicking(true)} hitSlop={6} accessibilityRole="button">
          <Text style={styles.link}>{t('otherDate')}</Text>
        </Pressable>
      )}

      {lead?.follow_up_date ? (
        <Pressable style={[styles.done, busy && styles.off]} disabled={busy} onPress={() => commit(null)} accessibilityRole="button">
          <Check size={15} strokeWidth={2} color={colors.positive} />
          <Text style={styles.doneText}>{t('markDone')}</Text>
        </Pressable>
      ) : null}

      {err ? <Text style={styles.error}>{err}</Text> : null}
    </Sheet>
  )
}

const styles = themed((c) => ({
  sub: { fontSize: 14, color: c.textSub },
  presets: { flexDirection: 'row', gap: 8 },
  preset: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
  presetLabel: { fontSize: 14, fontWeight: '600', color: c.text },
  presetDate: { fontSize: 12, color: c.textSub },
  custom: { gap: 8 },
  label: { fontSize: 13, color: c.textSub },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: c.card },
  primary: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.btnBg },
  primaryText: { fontSize: 15, fontWeight: '600', color: c.onBtn },
  link: { fontSize: 14, fontWeight: '600', color: c.brand, textAlign: 'center', paddingVertical: 6 },
  done: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, borderWidth: 1, borderColor: c.border },
  doneText: { fontSize: 14, color: c.text },
  error: { fontSize: 13, color: c.danger },
  off: { opacity: 0.5 },
}))
