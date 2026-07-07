import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { Trash2, Plus } from 'lucide-react-native'
import Sheet from '../components/Sheet'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Quote source picker + personal pool manager (ports web QuoteSourceModal):
// pick system/personal, add/remove personal quotes (user_quotes). Source persists
// under prefs.quoteSource; the pool is editable regardless of the active source.
const M = (k, o) => i18n.t(`modalsSystem:quoteSource.${k}`, o)
const SOURCES = [{ k: 'system', tk: 'sourceSystem' }, { k: 'personal', tk: 'sourcePersonal' }]

export default function QuoteSourceModal({ open, onClose, source, onChangeSource, userQuotes = [], onAdd, onRemove }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    const clean = text.trim()
    if (!clean) { setErr(M('writeFirst', { defaultValue: 'כתבו ציטוט קודם' })); return }
    setBusy(true); setErr('')
    try { await onAdd({ text: clean, author: null }); setText('') }
    catch (e) { setErr(M('saveFailed', { error: e.message || M('tryAgain', { defaultValue: 'נסו שוב' }) })) }
    finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} title={M('title', { defaultValue: 'מקור הציטוט' })}>
      <Text style={styles.label}>{M('pickLabel', { defaultValue: 'בחרו מקור' })}</Text>
      <View style={styles.pills}>
        {SOURCES.map((s) => {
          const on = source === s.k
          return (
            <Pressable key={s.k} style={[styles.pill, on && styles.pillOn]} onPress={() => onChangeSource(s.k)}>
              <Text style={[styles.pillText, on && styles.pillTextOn]}>{M(s.tk)}</Text>
            </Pressable>
          )
        })}
      </View>
      {source === 'personal' && userQuotes.length === 0 ? (
        <Text style={styles.hint}>{M('emptyPersonal', { defaultValue: 'המאגר האישי ריק — יוצג ציטוט מערכת עד שתוסיפו.' })}</Text>
      ) : null}

      <Text style={styles.label}>{M('addLabel', { defaultValue: 'הוספת ציטוט אישי' })}</Text>
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={(v) => { setText(v); if (err) setErr('') }}
          placeholder={M('addPlaceholder', { defaultValue: 'כתבו ציטוט…' })}
          placeholderTextColor={colors.textFaint}
          onSubmitEditing={submit}
        />
        <Pressable style={styles.addBtn} onPress={submit} disabled={busy} accessibilityLabel={M('addAria', { defaultValue: 'הוספה' })}>
          <Plus size={16} strokeWidth={1.8} color={colors.onBrand} />
        </Pressable>
      </View>

      {userQuotes.length > 0 ? (
        <>
          <Text style={styles.label}>{M('myQuotes', { count: userQuotes.length, defaultValue: `הציטוטים שלי (${userQuotes.length})` })}</Text>
          <View style={styles.list}>
            {userQuotes.map((q) => (
              <View key={q.id} style={styles.row}>
                <Text style={styles.rowText}>{q.text}</Text>
                <Pressable onPress={() => onRemove(q.id)} hitSlop={8} accessibilityLabel={M('removeAria', { defaultValue: 'מחיקה' })}>
                  <Trash2 size={14} strokeWidth={1.7} color={colors.danger} />
                </Pressable>
              </View>
            ))}
          </View>
        </>
      ) : null}
      {err ? <Text style={styles.error}>{err}</Text> : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '500', color: colors.textSub, marginTop: 14, marginBottom: 6 },
  pills: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat, alignItems: 'center' },
  pillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { fontSize: 14, color: colors.textSub },
  pillTextOn: { color: colors.onBrand, fontWeight: '600' },
  hint: { fontSize: 12, color: colors.textFaint, marginTop: 8, lineHeight: 17 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text, backgroundColor: 'rgba(255,255,255,0.4)' },
  addBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  list: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(42,37,32,0.04)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  rowText: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 19 },
  error: { fontSize: 13, color: colors.danger, marginTop: 10 },
})
