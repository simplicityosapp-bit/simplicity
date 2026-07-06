import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { Plus, X } from 'lucide-react-native'
import Sheet from '../components/Sheet'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Manage expense categories (mirrors web CategoriesSection). Add via the inline
// input, remove via the chip's ×.
export default function FinanceCategoriesModal({ open, onClose, categories, onAdd, onRemove }) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    const v = input.trim(); if (!v || busy) return
    setBusy(true); try { await onAdd(v); setInput('') } finally { setBusy(false) }
  }
  return (
    <Sheet open={open} onClose={onClose} title={i18n.t('finance:categories.title', { defaultValue: 'קטגוריות הוצאות' })}>
      <View style={styles.chips}>
        {categories.length ? categories.map((c) => (
          <View key={c.id} style={styles.chip}>
            <View style={[styles.dot, { backgroundColor: c.color || colors.textSub }]} />
            <Text style={styles.chipText}>{c.name}</Text>
            <Pressable onPress={() => onRemove(c.id)} hitSlop={6}><X size={13} strokeWidth={2} color={colors.textFaint} /></Pressable>
          </View>
        )) : <Text style={styles.empty}>{i18n.t('finance:categories.empty', { defaultValue: 'אין קטגוריות עדיין.' })}</Text>}
      </View>
      <View style={styles.addRow}>
        <TextInput style={styles.input} value={input} onChangeText={setInput} placeholder={i18n.t('finance:categories.namePlaceholder', { defaultValue: 'שם קטגוריה' })} placeholderTextColor={colors.textFaint} onSubmitEditing={add} />
        <Pressable style={styles.addBtn} onPress={add} disabled={busy || !input.trim()}><Plus size={18} strokeWidth={2} color={colors.onBrand} /></Pressable>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 13, color: colors.text },
  empty: { fontSize: 12, color: colors.textFaint },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  addBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
})
