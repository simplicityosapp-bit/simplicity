import { useState } from 'react'
import { View, ScrollView, StyleSheet } from 'react-native'
import { Text } from './Text'
import { Pressable } from './Pressable'
import { ChevronDown, Check } from 'lucide-react-native'
import { colors } from '../theme/theme'
import { useBackHandler } from '../lib/useBackHandler'
import { themed } from '../theme/themed'

// Inline select field for the add/edit sheets — a tappable control that expands
// an option list right below it (no nested Modal, so it composes inside the
// Sheet without conflicts). options = [{ value, label }]. A null/'' value shows
// the placeholder.
export default function Select({ label, value, options = [], onChange, placeholder }) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)
  /* Back collapses the option list first. Only reaches here when the Select
     sits on a screen (Settings); inside a Sheet the Modal takes the press. */
  useBackHandler(open, () => setOpen(false))
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
        /* Bounded and scrollable. The list expands into the form rather than
           floating over it, so picking a client out of eighty pushed the rest
           of the sheet — and the buttons — past the bottom of an 86%-tall
           panel. nestedScrollEnabled is what makes an inner scroller work at
           all on Android. */
        <ScrollView style={styles.options} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {options.map((o, i) => {
            const on = o.value === value
            return (
              <Pressable key={String(o.value) + i} style={[styles.option, i > 0 && styles.optionBorder]} onPress={() => { onChange(o.value); setOpen(false) }}>
                <Text style={[styles.optionText, on && styles.optionOn]} numberOfLines={1}>{o.label}</Text>
                {on ? <Check size={15} strokeWidth={2.2} color={colors.positive} /> : null}
              </Pressable>
            )
          })}
        </ScrollView>
      ) : null}
    </View>
  )
}

const styles = themed((c, t) => ({
  field: { gap: 6 },
  label: { fontSize: 13, color: c.textSub },
  control: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: c.border, borderRadius: 18, paddingVertical: 11, paddingHorizontal: 14, backgroundColor: c.card },
  value: { flex: 1, fontSize: 14, color: c.text },
  placeholder: { color: c.textFaint },
  chevOpen: { transform: [{ rotate: '180deg' }] },
  options: { maxHeight: 232, borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: c.card, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 12, paddingHorizontal: 14 },
  optionBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
  optionText: { flex: 1, fontSize: 15, color: c.text },
  optionOn: { fontWeight: '600', color: c.positive },
}))
