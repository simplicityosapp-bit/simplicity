import { useState } from 'react'
import { View, ScrollView } from 'react-native'
import { Text, TextInput } from '../components/Text'
import { Pressable } from '../components/Pressable'
import { MessageCircle, CalendarClock, FileText, CreditCard, Check } from 'lucide-react-native'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'
import { usePreferences } from '../lib/preferences'
import { useBottomPad } from '../lib/bottomBar'

// Connections — the mobile-feasible slice: WhatsApp click-to-chat message
// templates (editable, stored in prefs.whatsapp.templates, mirrors web), plus
// read-only status cards for the integrations whose setup (Google OAuth / invoice
// API keys) has to happen on the desktop app.
//
// Every string comes from the keys web's connections screens use. This screen
// asked for keys that exist nowhere (connections:title, whatsapp.*, save), so it
// was Hebrew in every language, and its field labels and placeholders were its
// own inventions rather than the messages the app actually sends.
const T = (k, d) => i18n.t(`connections:${k}`, { defaultValue: d })
const WA_FIELDS = [
  { key: 'client', tokens: ['name'] },
  { key: 'reminder', tokens: ['name', 'title'] },
  { key: 'meeting', tokens: ['name', 'date', 'time'] },
  { key: 'receipt', tokens: ['name', 'number', 'url'] },
  { key: 'lead', tokens: ['name'] },
  { key: 'payment', tokens: ['name', 'balance'] },
]
/* Grow is not offered on web yet (GROW_ENABLED is off), so "set it up on the
   desktop" sent coaches looking for a screen that is not there. It says what
   web says: soon. */
const STATUS = [
  { key: 'calendar', Icon: CalendarClock, label: () => 'Google Calendar', note: () => T('list.desktopSetup', 'מוגדר באפליקציית המחשב') },
  { key: 'invoicing', Icon: FileText, label: () => T('list.invoices', 'חשבוניות'), note: () => T('list.desktopSetup', 'מוגדר באפליקציית המחשב') },
  { key: 'grow', Icon: CreditCard, label: () => T('list.grow', 'סליקה · Grow'), note: () => T('list.soon', 'בקרוב') },
]

export default function ConnectionsScreen() {
  const bottomPad = useBottomPad()
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
      <ScrollView contentContainerStyle={[styles.content, bottomPad]} showsVerticalScrollIndicator={false}>
        <ScreenHead
          title={T('list.title', 'חיבורים')}
        />

        {/* WhatsApp — editable click-to-chat templates */}
        <Card contentStyle={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.chip, styles.chipSage]}><MessageCircle size={18} strokeWidth={1.7} color={colors.positive} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>WhatsApp</Text>
              <Text style={styles.cardSub}>{T('list.whatsappStatus', 'שליחה ידנית · עריכת הודעות')}</Text>
            </View>
          </View>
          {WA_FIELDS.map((f) => (
            <View key={f.key} style={styles.field}>
              <Text style={styles.fieldLabel}>{T(`whatsappScreen.fields.${f.key}.label`, f.key)}</Text>
              <TextInput
                style={styles.input}
                value={draft[f.key] || ''}
                onChangeText={(v) => setField(f.key, v)}
                /* The message sent when no template is set — so an empty field
                   shows what will actually go out. */
                placeholder={i18n.t(`components:whatsapp.defaults.${f.key}`, { defaultValue: '' })}
                placeholderTextColor={colors.textFaint}
                multiline
              />
              <Text style={styles.tokens}>{f.tokens.map((tk) => `{{${tk}}}`).join('   ')}</Text>
            </View>
          ))}
          <Pressable style={styles.saveBtn} onPress={save}>
            <Check size={16} strokeWidth={2.2} color={colors.onBtn} />
            <Text style={styles.saveText}>{saved ? T('whatsappScreen.saved', 'נשמר') : T('whatsappScreen.save', 'שמירה')}</Text>
          </Pressable>
        </Card>

        {/* Integrations configured on desktop */}
        {STATUS.map((s) => (
          <Card key={s.key} contentStyle={styles.statusCard}>
            <View style={[styles.chip, styles.chipNeutral]}><s.Icon size={18} strokeWidth={1.7} color={colors.textSub} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{s.label()}</Text>
              <Text style={styles.cardSub}>{s.note()}</Text>
            </View>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  )
}

const styles = themed((c, t) => ({
  content: { paddingHorizontal: 20, gap: 12 },
  card: { gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chip: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: c.divider },
  chipSage: { backgroundColor: 'rgba(139,168,136,0.16)', borderColor: 'rgba(139,168,136,0.32)' },
  chipNeutral: { backgroundColor: c.glassTint },
  cardTitle: { fontSize: 15, fontWeight: '600', color: c.text },
  cardSub: { fontSize: 12, color: c.textSub, marginTop: 1 },
  field: { gap: 5 },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: c.textSub },
  input: { minHeight: 44, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: c.text, backgroundColor: c.inputBg, textAlignVertical: 'top' },
  tokens: { fontSize: 11, color: c.textFaint, letterSpacing: 0.3 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.btnBg, borderRadius: 14, paddingVertical: 12, marginTop: 2 },
  saveText: { fontSize: 15, fontWeight: '600', color: c.onBtn },
}))
