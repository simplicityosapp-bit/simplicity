import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native'
import { MessageCircle, CalendarClock, FileText, CreditCard, Check } from 'lucide-react-native'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import { colors } from '../theme/theme'
import { usePreferences } from '../lib/preferences'

// Connections — the mobile-feasible slice: WhatsApp click-to-chat message
// templates (editable, stored in prefs.whatsapp.templates, mirrors web), plus
// read-only status cards for the integrations whose setup (Google OAuth / invoice
// API keys / Grow) has to happen on the desktop app.
const T = (k, d) => i18n.t(`connections:${k}`, { defaultValue: d })
const WA_FIELDS = [
  { key: 'client', label: 'הודעה ללקוח', tokens: ['name'], ph: 'היי {{name}}, מה שלומך?' },
  { key: 'reminder', label: 'תזכורת', tokens: ['name', 'title'], ph: 'היי {{name}}, תזכורת: {{title}}' },
  { key: 'meeting', label: 'זימון פגישה', tokens: ['name', 'date', 'time'], ph: 'היי {{name}}, נפגשים ב-{{date}} בשעה {{time}}' },
  { key: 'receipt', label: 'קבלה', tokens: ['name', 'number', 'url'], ph: 'היי {{name}}, הקבלה מס׳ {{number}}: {{url}}' },
  { key: 'lead', label: 'פנייה לליד', tokens: ['name'], ph: 'היי {{name}}, תודה על פנייתך!' },
  { key: 'payment', label: 'בקשת תשלום', tokens: ['name', 'balance'], ph: 'היי {{name}}, נותרה יתרה של {{balance}}' },
]
const STATUS = [
  { key: 'calendar', Icon: CalendarClock, label: 'יומן Google' },
  { key: 'invoicing', Icon: FileText, label: 'חשבוניות' },
  { key: 'grow', Icon: CreditCard, label: 'סליקת אשראי (Grow)' },
]

export default function ConnectionsScreen() {
  const { prefs, update } = usePreferences()
  const [draft, setDraft] = useState(() => ({ ...(prefs.whatsapp?.templates || {}) }))
  const [saved, setSaved] = useState(false)
  const setField = (k, v) => { setSaved(false); setDraft((d) => ({ ...d, [k]: v })) }
  const save = async () => {
    const templates = Object.fromEntries(WA_FIELDS.map((f) => [f.key, (draft[f.key] || '').trim()]))
    try { await update({ whatsapp: { templates } }); setSaved(true) } catch { /* surfaced by the provider */ }
  }

  return (
    <Screen name="clients">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHead
          title={T('title', 'חיבורים')}
          tagline={T('tagline', 'ערוצי התקשורת והאינטגרציות שלך.')}
        />

        {/* WhatsApp — editable click-to-chat templates */}
        <Card contentStyle={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.chip, styles.chipSage]}><MessageCircle size={18} strokeWidth={1.7} color={colors.positive} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>WhatsApp</Text>
              <Text style={styles.cardSub}>{T('whatsapp.sub', 'תבניות ההודעות שלך · שליחה בלחיצה')}</Text>
            </View>
          </View>
          {WA_FIELDS.map((f) => (
            <View key={f.key} style={styles.field}>
              <Text style={styles.fieldLabel}>{T(`whatsapp.${f.key}`, f.label)}</Text>
              <TextInput
                style={styles.input}
                value={draft[f.key] || ''}
                onChangeText={(v) => setField(f.key, v)}
                placeholder={f.ph}
                placeholderTextColor={colors.textFaint}
                multiline
              />
              <Text style={styles.tokens}>{f.tokens.map((tk) => `{{${tk}}}`).join('   ')}</Text>
            </View>
          ))}
          <Pressable style={styles.saveBtn} onPress={save}>
            <Check size={16} strokeWidth={2.2} color={colors.onBtn} />
            <Text style={styles.saveText}>{saved ? T('saved', 'נשמר') : T('save', 'שמירה')}</Text>
          </Pressable>
        </Card>

        {/* Integrations configured on desktop */}
        {STATUS.map((s) => (
          <Card key={s.key} contentStyle={styles.statusCard}>
            <View style={[styles.chip, styles.chipNeutral]}><s.Icon size={18} strokeWidth={1.7} color={colors.textSub} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{s.label}</Text>
              <Text style={styles.cardSub}>{T('desktopOnly', 'מוגדר באפליקציית המחשב')}</Text>
            </View>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 96, gap: 12 },
  card: { gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chip: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: colors.divider },
  chipSage: { backgroundColor: 'rgba(139,168,136,0.16)', borderColor: 'rgba(139,168,136,0.32)' },
  chipNeutral: { backgroundColor: colors.glassTint },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  cardSub: { fontSize: 12, color: colors.textSub, marginTop: 1 },
  field: { gap: 5 },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: colors.textSub },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text, backgroundColor: colors.inputBg, textAlignVertical: 'top' },
  tokens: { fontSize: 11, color: colors.textFaint, letterSpacing: 0.3 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.btnBg, borderRadius: 14, paddingVertical: 12, marginTop: 2 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBtn },
})
