import { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Plus } from 'lucide-react-native'
import AddTaskModal from '../../modals/AddTaskModal'
import QuickGoalUpdatePicker from '../../modals/QuickGoalUpdatePicker'
import AddGoalEntryModal from '../../modals/AddGoalEntryModal'
import i18n from '../../lib/i18n'
import { colors } from '../../theme/theme'

// Two quick-add CTAs on home (mirrors web QuickRow):
//  • הוספה מהירה → AddTaskModal (v1; the full add-launcher grid lands once more
//    add-flows exist — transaction/client/lead/…).
//  • עדכון יעד   → goal-category picker → AddGoalEntryModal.
export default function QuickRow({ goals, categories, addTask, addEntry }) {
  const [showTask, setShowTask] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [entryCategory, setEntryCategory] = useState(null)

  return (
    <View style={styles.row}>
      <Pressable style={[styles.btn, styles.primary]} onPress={() => setShowTask(true)}>
        <Plus size={18} strokeWidth={2} color={colors.onBrand} />
        <Text style={styles.primaryText}>{i18n.t('home:widgets.quick.quickAdd')}</Text>
      </Pressable>
      <Pressable style={[styles.btn, styles.secondary]} onPress={() => setShowPicker(true)}>
        <Plus size={18} strokeWidth={2} color={colors.text} />
        <Text style={styles.secondaryText}>{i18n.t('home:widgets.quick.goalUpdate')}</Text>
      </Pressable>

      <AddTaskModal open={showTask} onClose={() => setShowTask(false)} onSave={addTask} />
      <QuickGoalUpdatePicker
        open={showPicker}
        onClose={() => setShowPicker(false)}
        categories={categories}
        goals={goals}
        onPick={setEntryCategory}
      />
      <AddGoalEntryModal
        open={!!entryCategory}
        onClose={() => setEntryCategory(null)}
        category={entryCategory}
        onSave={addEntry}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14 },
  primary: { backgroundColor: colors.brand },
  primaryText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
  secondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  secondaryText: { fontSize: 15, fontWeight: '600', color: colors.text },
})
