import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native'
import { Plus, X } from 'lucide-react-native'
import Sheet from '../components/Sheet'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import { CATEGORY_COLORS } from '../hooks/useFinanceData'

// Manage the shared task taxonomy — custom statuses + categories (mirrors web
// TaskTaxonomyModal). A status rolls up to one of two fixed meta buckets
// (open/done) so the binary open/done counters keep working; the picker is
// required because task_statuses.meta_category is CHECK-constrained to
// ('open','done'). Deleting un-tags every task using it, so it confirms first.
const T = (k, o) => i18n.t(`modalsTask:taxonomy.${k}`, o)
const META = [{ key: 'open', label: 'metaOpen' }, { key: 'done', label: 'metaDone' }]

export default function TaskTaxonomyModal({ open, onClose, statuses = [], categories = [], onAddStatus, onRemoveStatus, onAddCategory, onRemoveCategory }) {
  const [sName, setSName] = useState('')
  const [sMeta, setSMeta] = useState('open')
  const [sColor, setSColor] = useState(CATEGORY_COLORS[0])
  const [cName, setCName] = useState('')
  const [cColor, setCColor] = useState(CATEGORY_COLORS[3])
  const [busy, setBusy] = useState(false)

  const addStatus = async () => {
    const name = sName.trim(); if (!name || busy) return
    setBusy(true)
    try { await onAddStatus({ display_name: name, meta_category: sMeta, color: sColor, icon: null, is_default: false }); setSName('') } finally { setBusy(false) }
  }
  const addCategory = async () => {
    const name = cName.trim(); if (!name || busy) return
    setBusy(true)
    try { await onAddCategory({ name, color: cColor }); setCName('') } finally { setBusy(false) }
  }
  const confirmRemove = (kind, id, name) => {
    Alert.alert(
      T('deleteTitle'),
      T(kind === 'status' ? 'deleteMessageStatus' : 'deleteMessageCategory', { name }),
      [
        { text: i18n.t('modalsTask:common.cancel', { defaultValue: 'ביטול' }), style: 'cancel' },
        { text: T('deleteConfirm'), style: 'destructive', onPress: () => (kind === 'status' ? onRemoveStatus : onRemoveCategory)(id) },
      ],
    )
  }

  const Swatches = ({ value, onPick }) => (
    <View style={styles.swatches}>
      {CATEGORY_COLORS.map((c) => (
        <Pressable key={c} onPress={() => onPick(c)} style={[styles.swatch, { backgroundColor: c }, value === c && styles.swatchOn]} />
      ))}
    </View>
  )

  return (
    <Sheet open={open} onClose={onClose} title={T('title')}>
      {/* ── Statuses ── */}
      <View style={styles.section}>
        <Text style={styles.label}>{T('statuses')}</Text>
        <Text style={styles.hint}>{T('statusesHint')}</Text>
        <View style={styles.pills}>
          {META.map((m) => (
            <Pressable key={m.key} onPress={() => setSMeta(m.key)} style={[styles.pill, sMeta === m.key && styles.pillOn]}>
              <Text style={[styles.pillText, sMeta === m.key && styles.pillTextOn]}>{T(m.label)}</Text>
            </Pressable>
          ))}
        </View>
        <Swatches value={sColor} onPick={setSColor} />
        <View style={styles.addRow}>
          <TextInput style={styles.input} value={sName} onChangeText={setSName} placeholder={T('statusPlaceholder')} placeholderTextColor={colors.textFaint} onSubmitEditing={addStatus} />
          <Pressable style={[styles.addBtn, (busy || !sName.trim()) && styles.addBtnOff]} onPress={addStatus} disabled={busy || !sName.trim()}><Plus size={18} strokeWidth={2} color={colors.onBrand} /></Pressable>
        </View>
        {META.map((m) => {
          const list = statuses.filter((s) => s.meta_category === m.key)
          return (
            <View key={m.key} style={styles.bucket}>
              <Text style={styles.bucketLabel}>{T(m.label)}</Text>
              {list.length ? (
                <View style={styles.chips}>
                  {list.map((s) => (
                    <View key={s.id} style={styles.chip}>
                      <View style={[styles.chipDot, { backgroundColor: s.color || colors.textSub }]} />
                      <Text style={styles.chipText}>{s.display_name}</Text>
                      <Pressable onPress={() => confirmRemove('status', s.id, s.display_name)} hitSlop={6}><X size={13} strokeWidth={2} color={colors.textFaint} /></Pressable>
                    </View>
                  ))}
                </View>
              ) : <Text style={styles.emptyHint}>—</Text>}
            </View>
          )
        })}
      </View>

      {/* ── Categories ── */}
      <View style={styles.section}>
        <Text style={styles.label}>{T('categories')}</Text>
        <Swatches value={cColor} onPick={setCColor} />
        <View style={styles.addRow}>
          <TextInput style={styles.input} value={cName} onChangeText={setCName} placeholder={T('categoryPlaceholder')} placeholderTextColor={colors.textFaint} onSubmitEditing={addCategory} />
          <Pressable style={[styles.addBtn, (busy || !cName.trim()) && styles.addBtnOff]} onPress={addCategory} disabled={busy || !cName.trim()}><Plus size={18} strokeWidth={2} color={colors.onBrand} /></Pressable>
        </View>
        {categories.length ? (
          <View style={styles.chips}>
            {categories.map((c) => (
              <View key={c.id} style={styles.chip}>
                <View style={[styles.chipDot, { backgroundColor: c.color || colors.textSub }]} />
                <Text style={styles.chipText}>{c.name}</Text>
                <Pressable onPress={() => confirmRemove('category', c.id, c.name)} hitSlop={6}><X size={13} strokeWidth={2} color={colors.textFaint} /></Pressable>
              </View>
            ))}
          </View>
        ) : <Text style={styles.emptyHint}>—</Text>}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  section: { gap: 10, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSub },
  hint: { fontSize: 12, color: colors.textFaint, lineHeight: 17 },
  pills: { flexDirection: 'row', gap: 8 },
  pill: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat },
  pillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { fontSize: 13, color: colors.textSub },
  pillTextOn: { color: colors.onBrand, fontWeight: '600' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: colors.text },
  bucket: { gap: 6 },
  bucketLabel: { fontSize: 12, fontWeight: '600', color: colors.textFaint },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 13, color: colors.text },
  emptyHint: { fontSize: 12, color: colors.textFaint },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  addBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  addBtnOff: { opacity: 0.5 },
})
