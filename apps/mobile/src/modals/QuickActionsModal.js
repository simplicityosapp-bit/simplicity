import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Wallet, CheckSquare, Users, UserPlus, FolderOpen, Bell } from 'lucide-react-native'
import Sheet from '../components/Sheet'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Quick-actions launcher (mirrors web QuickActionsModal) — a tile grid of every
// "add" entry-point; tapping a tile closes this sheet and signals the parent to
// open the matching Add* modal. Only the implemented actions are shown for now
// (task + transaction); the grid grows as more add-flows land.
const ACTIONS = [
  { id: 'transaction', Icon: Wallet },
  { id: 'client', Icon: Users },
  { id: 'lead', Icon: UserPlus },
  { id: 'task', Icon: CheckSquare },
  { id: 'project', Icon: FolderOpen },
  { id: 'reminder', Icon: Bell },
]

export default function QuickActionsModal({ open, onClose, onPick }) {
  return (
    <Sheet open={open} onClose={onClose} title={i18n.t('modalsSystem:quickActions.title')}>
      <View style={styles.grid}>
        {ACTIONS.map((a) => (
          <Pressable key={a.id} style={styles.tile} onPress={() => { onPick(a.id); onClose() }}>
            <a.Icon size={22} strokeWidth={1.8} color={colors.brand} />
            <Text style={styles.label}>{i18n.t(`modalsSystem:quickActions.actions.${a.id}`)}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexBasis: '31%', flexGrow: 1, backgroundColor: colors.card, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border, paddingVertical: 18, alignItems: 'center', gap: 8,
  },
  label: { fontSize: 13, color: colors.text },
})
