import { useMemo } from 'react'
import { View, Alert, Linking } from 'react-native'
import { Inbox, Check, X, MessageCircle } from 'lucide-react-native'
import { waLink } from '@simplicity/core'
import { Text } from '../../components/Text'
import { Pressable } from '../../components/Pressable'
import Card from '../../components/Card'
import i18n from '../../lib/i18n'
import { useWhatsAppMessage } from '../../hooks/useWhatsAppMessage'
import { colors } from '../../theme/theme'
import { themed } from '../../theme/themed'

const t = (k, o) => i18n.t(`leads:pending.${k}`, o)

/* ════════════════════════════════════════════════════════════════
   PENDING LEADS — public-page submissions awaiting approval.
   ════════════════════════════════════════════════════════════════
   Port of web's PendingLeadsSection. The phone showed a name and a phone
   and nothing else, so everything the person actually wrote on the page —
   the question they asked, the time that suits them — was invisible until
   the lead was approved blind. And reject was one tap on a real person's
   enquiry.

   Now: which page it came from, every builtin and free field with the
   page's own label, WhatsApp, approve in one tap (it only adds to the
   board), and reject behind a confirmation (it soft-deletes; the screen
   offers undo as well).
   ════════════════════════════════════════════════════════════════ */
export function pendingRows(lead, page) {
  const fieldLabel = {}
  if (Array.isArray(page?.fields)) page.fields.forEach((f) => { if (f?.key) fieldLabel[f.key] = f.label })
  const BUILTIN = { name: t('fName'), phone: t('fPhone'), email: t('fEmail'), notes: t('fNotes') }
  const out = []
  ;['name', 'phone', 'email', 'notes'].forEach((col) => {
    if (lead[col]) out.push({ key: col, label: BUILTIN[col], value: String(lead[col]) })
  })
  Object.entries(lead.data || {}).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') out.push({ key: `d-${k}`, label: fieldLabel[k] || k, value: String(v) })
  })
  return out
}

export default function PendingLeadsSection({ pending = [], pages = [], onApprove, onReject }) {
  const pageById = useMemo(() => Object.fromEntries((pages || []).map((p) => [p.id, p])), [pages])
  const waMsg = useWhatsAppMessage()
  if (!pending.length) return null

  const confirmReject = (lead) => {
    Alert.alert(
      t('rejectConfirm.title'),
      t('rejectConfirm.message', { name: lead.name || t('rejectConfirm.noName') }),
      [
        { text: i18n.t('modalsData:common.cancel', { defaultValue: 'ביטול' }), style: 'cancel' },
        { text: t('rejectConfirm.confirm'), style: 'destructive', onPress: () => onReject(lead) },
      ],
    )
  }

  return (
    <View style={styles.wrap} accessibilityLabel={t('aria')}>
      <View style={styles.head}>
        <Inbox size={16} strokeWidth={1.7} color={colors.brand} />
        <Text style={styles.title}>{t('title')}</Text>
        <Text style={styles.count}>{pending.length}</Text>
      </View>
      {pending.map((lead) => {
        const page = lead.page_id ? pageById[lead.page_id] : null
        return (
          <Card key={lead.id} contentStyle={styles.card}>
            {page?.title ? <Text style={styles.from}>{t('from', { page: page.title })}</Text> : null}
            {pendingRows(lead, page).map((r) => (
              <View key={r.key} style={styles.field}>
                <Text style={styles.label}>{r.label}</Text>
                <Text style={styles.value} selectable>{r.value}</Text>
              </View>
            ))}
            <View style={styles.actions}>
              <Pressable style={styles.wa} onPress={() => Linking.openURL(waLink(lead.phone || '', waMsg('lead', { name: lead.name }))).catch(() => {})} accessibilityLabel="WhatsApp" hitSlop={6}>
                <MessageCircle size={16} strokeWidth={1.7} color={colors.positive} />
              </Pressable>
              <View style={{ flex: 1 }} />
              <Pressable style={styles.reject} onPress={() => confirmReject(lead)} accessibilityRole="button" accessibilityLabel={t('reject')} hitSlop={6}>
                <X size={15} strokeWidth={2} color={colors.textSub} />
              </Pressable>
              <Pressable style={styles.approve} onPress={() => onApprove(lead)} accessibilityRole="button" hitSlop={6}>
                <Check size={15} strokeWidth={2} color={colors.onBrand} />
                <Text style={styles.approveText}>{t('approve')}</Text>
              </Pressable>
            </View>
          </Card>
        )
      })}
    </View>
  )
}

const styles = themed((c) => ({
  wrap: { gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: '600', color: c.textSub },
  count: { fontSize: 13, color: c.textFaint },
  card: { gap: 8 },
  from: { fontSize: 12, color: c.brand, fontWeight: '500' },
  field: { gap: 1 },
  label: { fontSize: 11, color: c.textFaint },
  value: { fontSize: 14, color: c.text, lineHeight: 20 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  wa: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.cardFlat },
  reject: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },
  approve: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, borderRadius: 999, backgroundColor: c.positive },
  approveText: { fontSize: 13, fontWeight: '600', color: c.onBrand },
}))
