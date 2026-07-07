import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { Plus, X, Check } from 'lucide-react-native'
import Sheet from '../components/Sheet'
import { CATEGORY_COLORS } from '../hooks/useFinanceData'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Manage expense categories (mirrors web CategoriesSection). Add via the inline
// input + a color swatch, remove via the chip's ×.
export default function FinanceCategoriesModal({ open, onClose, categories, onAdd, onRemove }) {
  const [input, setInput] = useState('')
  const [color, setColor] = useState(CATEGORY_COLORS[0])
  const [busy, setBusy] = useState(false)
  const add = async () => {
    const v = input.trim(); if (!v || busy) return
    setBusy(true); try { await onAdd(v, color); setInput('') } finally { setBusy(false) }
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
      <View style={styles.swatches}>
        {CATEGORY_COLORS.map((c) => (
          <Pressable key={c} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]} onPress={() => setColor(c)}>
            {color === c ? <Check size={13} strokeWidth={2.5} color={colors.onBrand} /> : null}
          </Pressable>
        ))}
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
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  swatch: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: colors.text },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  addBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
})
