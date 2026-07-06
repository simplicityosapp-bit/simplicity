import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { Plus, X } from 'lucide-react-native'
import Sheet from '../components/Sheet'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Manage the shared task taxonomy — custom statuses + categories (mirrors web
// TaskTaxonomyModal). Add via the inline input, remove via the chip's ×.
export default function TaskTaxonomyModal({ open, onClose, statuses, categories, onAddStatus, onRemoveStatus, onAddCategory, onRemoveCategory }) {
  const [statusInput, setStatusInput] = useState('')
  const [categoryInput, setCategoryInput] = useState('')
  const [busy, setBusy] = useState(false)

  const addStatus = async () => {
    const v = statusInput.trim(); if (!v || busy) return
    setBusy(true); try { await onAddStatus(v); setStatusInput('') } finally { setBusy(false) }
  }
  const addCategory = async () => {
    const v = categoryInput.trim(); if (!v || busy) return
    setBusy(true); try { await onAddCategory(v); setCategoryInput('') } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} title={i18n.t('tasks:taxonomy.manage', { defaultValue: 'סטטוסים וקטגוריות' })}>
      <View style={styles.section}>
        <Text style={styles.label}>{i18n.t('tasks:taxonomy.statuses', { defaultValue: 'סטטוסים' })}</Text>
        <View style={styles.chips}>
          {statuses.length ? statuses.map((s) => (
            <View key={s.id} style={styles.chip}>
              {s.icon ? <Text style={styles.chipIcon}>{s.icon}</Text> : <View style={[styles.chipDot, { backgroundColor: s.color || colors.textSub }]} />}
              <Text style={styles.chipText}>{s.display_name}</Text>
              <Pressable onPress={() => onRemoveStatus(s.id)} hitSlop={6}><X size={13} strokeWidth={2} color={colors.textFaint} /></Pressable>
            </View>
          )) : <Text style={styles.emptyHint}>{i18n.t('tasks:taxonomy.noStatuses', { defaultValue: 'אין סטטוסים מותאמים' })}</Text>}
        </View>
        <View style={styles.addRow}>
          <TextInput style={styles.input} value={statusInput} onChangeText={setStatusInput} placeholder={i18n.t('tasks:taxonomy.statusPlaceholder', { defaultValue: 'סטטוס חדש…' })} placeholderTextColor={colors.textFaint} onSubmitEditing={addStatus} />
          <Pressable style={styles.addBtn} onPress={addStatus} disabled={busy || !statusInput.trim()}><Plus size={18} strokeWidth={2} color={colors.onBrand} /></Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>{i18n.t('tasks:taxonomy.categories', { defaultValue: 'קטגוריות' })}</Text>
        <View style={styles.chips}>
          {categories.length ? categories.map((c) => (
            <View key={c.id} style={styles.chip}>
              <View style={[styles.chipDot, { backgroundColor: c.color || colors.textSub }]} />
              <Text style={styles.chipText}>{c.name}</Text>
              <Pressable onPress={() => onRemoveCategory(c.id)} hitSlop={6}><X size={13} strokeWidth={2} color={colors.textFaint} /></Pressable>
            </View>
          )) : <Text style={styles.emptyHint}>{i18n.t('tasks:taxonomy.noCategories', { defaultValue: 'אין קטגוריות' })}</Text>}
        </View>
        <View style={styles.addRow}>
          <TextInput style={styles.input} value={categoryInput} onChangeText={setCategoryInput} placeholder={i18n.t('tasks:taxonomy.categoryPlaceholder', { defaultValue: 'קטגוריה חדשה…' })} placeholderTextColor={colors.textFaint} onSubmitEditing={addCategory} />
          <Pressable style={styles.addBtn} onPress={addCategory} disabled={busy || !categoryInput.trim()}><Plus size={18} strokeWidth={2} color={colors.onBrand} /></Pressable>
        </View>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSub },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat },
  chipIcon: { fontSize: 12 },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 13, color: colors.text },
  emptyHint: { fontSize: 12, color: colors.textFaint },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  addBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
})
