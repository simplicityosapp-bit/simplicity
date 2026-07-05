import { View, Text, Pressable, StyleSheet } from 'react-native'
import Sheet from '../components/Sheet'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Pick a manual goal category to log an entry for (mirrors web
// QuickGoalUpdatePicker). Only categories with a live manual goal are shown.
export default function QuickGoalUpdatePicker({ open, onClose, categories = [], goals = [], onPick }) {
  const goalCatIds = new Set(goals.filter((g) => !g.deleted_at).map((g) => g.category_id))
  const choices = categories.filter((c) => c.measurement_type === 'manual' && goalCatIds.has(c.id))

  return (
    <Sheet open={open} onClose={onClose} title={i18n.t('modalsData:quickUpdate.title')}>
      {choices.length === 0 ? (
        <Text style={styles.empty}>{i18n.t('modalsData:quickUpdate.empty')}</Text>
      ) : (
        choices.map((c) => {
          const goalNames = goals.filter((g) => !g.deleted_at && g.category_id === c.id && g.label).map((g) => g.label)
          const name = goalNames.length ? `${c.name} · ${goalNames.join(', ')}` : c.name
          return (
            <Pressable key={c.id} style={styles.choice} onPress={() => { onPick(c); onClose() }}>
              <Text style={styles.icon}>{c.icon || '⭐'}</Text>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>{name}</Text>
                <Text style={styles.hint}>{i18n.t('modalsData:quickUpdate.logProgress')}</Text>
              </View>
            </Pressable>
          )
        })
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  empty: { fontSize: 14, color: colors.textSub, textAlign: 'center', paddingVertical: 12 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  icon: { fontSize: 22 },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '500', color: colors.text },
  hint: { fontSize: 12, color: colors.textFaint },
})
