import { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { ChevronDown, Check } from 'lucide-react-native'
import { colors } from '../theme/theme'

// Inline select field for the add/edit sheets — a tappable control that expands
// an option list right below it (no nested Modal, so it composes inside the
// Sheet without conflicts). options = [{ value, label }]. A null/'' value shows
// the placeholder.
export default function Select({ label, value, options = [], onChange, placeholder }) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable style={styles.control} onPress={() => setOpen((o) => !o)}>
        <Text style={[styles.value, !selected && styles.placeholder]} numberOfLines={1}>
          {selected ? selected.label : (placeholder || '—')}
        </Text>
        <ChevronDown size={18} strokeWidth={1.6} color={colors.textFaint} style={open ? styles.chevOpen : null} />
      </Pressable>
      {open ? (
        <View style={styles.options}>
          {options.map((o, i) => {
            const on = o.value === value
            return (
              <Pressable key={String(o.value) + i} style={[styles.option, i > 0 && styles.optionBorder]} onPress={() => { onChange(o.value); setOpen(false) }}>
                <Text style={[styles.optionText, on && styles.optionOn]} numberOfLines={1}>{o.label}</Text>
                {on ? <Check size={15} strokeWidth={2.2} color={colors.brand} /> : null}
              </Pressable>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 13, color: colors.textSub },
  control: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, backgroundColor: colors.card },
  value: { flex: 1, fontSize: 15, color: colors.text },
  placeholder: { color: colors.textFaint },
  chevOpen: { transform: [{ rotate: '180deg' }] },
  options: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 12, paddingHorizontal: 14 },
  optionBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  optionText: { flex: 1, fontSize: 15, color: colors.text },
  optionOn: { fontWeight: '600', color: colors.brand },
})
