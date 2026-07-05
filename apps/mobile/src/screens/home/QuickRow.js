import { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Plus } from 'lucide-react-native'
import QuickActionsModal from '../../modals/QuickActionsModal'
import AddTaskModal from '../../modals/AddTaskModal'
import AddTransactionModal from '../../modals/AddTransactionModal'
import AddClientModal from '../../modals/AddClientModal'
import AddLeadModal from '../../modals/AddLeadModal'
import AddProjectModal from '../../modals/AddProjectModal'
import AddReminderModal from '../../modals/AddReminderModal'
import AddMeetingModal from '../../modals/AddMeetingModal'
import QuickGoalUpdatePicker from '../../modals/QuickGoalUpdatePicker'
import AddGoalEntryModal from '../../modals/AddGoalEntryModal'
import i18n from '../../lib/i18n'
import { colors } from '../../theme/theme'

// Two quick-add CTAs on home (mirrors web QuickRow):
//  • הוספה מהירה → QuickActionsModal launcher → the picked Add* modal
//    (task/transaction implemented; more add-flows land incrementally).
//  • עדכון יעד   → goal-category picker → AddGoalEntryModal.
export default function QuickRow({ clients, goals, categories, addTask, addEntry, addTransaction, addClient, addLead, addProject, addReminder, addMeeting }) {
  const [showLauncher, setShowLauncher] = useState(false)
  const [active, setActive] = useState(null) // 'task' | 'transaction'
  const [showPicker, setShowPicker] = useState(false)
  const [entryCategory, setEntryCategory] = useState(null)
  const close = () => setActive(null)

  return (
    <View style={styles.row}>
      <Pressable style={[styles.btn, styles.primary]} onPress={() => setShowLauncher(true)}>
        <Plus size={18} strokeWidth={2} color={colors.onBrand} />
        <Text style={styles.primaryText}>{i18n.t('home:widgets.quick.quickAdd')}</Text>
      </Pressable>
      <Pressable style={[styles.btn, styles.secondary]} onPress={() => setShowPicker(true)}>
        <Plus size={18} strokeWidth={2} color={colors.text} />
        <Text style={styles.secondaryText}>{i18n.t('home:widgets.quick.goalUpdate')}</Text>
      </Pressable>

      <QuickActionsModal open={showLauncher} onClose={() => setShowLauncher(false)} onPick={setActive} />
      <AddTaskModal open={active === 'task'} onClose={close} onSave={addTask} />
      <AddTransactionModal open={active === 'transaction'} onClose={close} onSave={addTransaction} />
      <AddClientModal open={active === 'client'} onClose={close} onSave={addClient} />
      <AddLeadModal open={active === 'lead'} onClose={close} onSave={addLead} />
      <AddProjectModal open={active === 'project'} onClose={close} onSave={addProject} />
      <AddReminderModal open={active === 'reminder'} onClose={close} onSave={addReminder} />
      <AddMeetingModal open={active === 'meeting'} onClose={close} onSave={addMeeting} clients={clients} />

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
