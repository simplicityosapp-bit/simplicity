import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { goalsByCategory, formatGoalValue, timeFrameLabel } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import AddGoalModal from '../modals/AddGoalModal'
import EditGoalModal from '../modals/EditGoalModal'
import { colors } from '../theme/theme'
import { useGoalsData } from '../hooks/useGoalsData'

// Goals screen — goals grouped by category, each scored by the shared core
// engine (goalsByCategory → moonGetData): a pace bar + actual/target value,
// over the per-screen photo (Warm Precision theme). "+" adds a goal.
export default function GoalsScreen() {
  const { goals, categories, entries, transactions, clients, leads, answers, members, groups, loading, error, refetch, addGoal, updateGoal, deleteGoal } = useGoalsData()
  const [showAdd, setShowAdd] = useState(false)
  const [editGoal, setEditGoal] = useState(null)

  const cats = useMemo(
    () => goalsByCategory(new Date(), { goals, categories, entries, transactions, clients, leads, answers, members, groups }),
    [goals, categories, entries, transactions, clients, leads, answers, members, groups],
  )

  return (
    <Screen name="goals">
      <ScreenHead
        title={i18n.t('goals:title', { defaultValue: 'יעדים' })}
        meta={[i18n.t('goals:countLabel', { count: goals.length, defaultValue: `${goals.length} יעדים` })]}
        tagline={i18n.t('goals:tagline', { defaultValue: 'כל יעד — כיוון, לא לחץ.' })}
        onAdd={() => setShowAdd(true)}
        addLabel={i18n.t('goals:newGoalAria', { defaultValue: 'יעד חדש' })}
      />
      <AddGoalModal open={showAdd} onClose={() => setShowAdd(false)} onSave={addGoal} />
      <EditGoalModal open={!!editGoal} goal={editGoal} onClose={() => setEditGoal(null)} onSave={updateGoal} onDelete={deleteGoal} />

      {loading && !cats.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {cats.length ? (
            cats.map(({ category, goals: scored }) => (
              <View key={category.id} style={styles.group}>
                <Text style={styles.catName}>{category.name || ''}</Text>
                <Card padded={false}>
                  {scored.map((s, i) => {
                    const pct = Math.min(100, Math.max(0, s.pure ?? 0))
                    return (
                      <Pressable key={s.goal.id || i} style={[styles.goal, i > 0 && styles.goalBorder]} onPress={() => setEditGoal(s.goal)}>
                        <View style={styles.goalHead}>
                          <Text style={styles.goalLabel} numberOfLines={1}>{s.goal.label || category.name || ''}</Text>
                          <Text style={styles.goalVal}>{formatGoalValue(s.actual, s.cat)} / {formatGoalValue(s.target, s.cat)}</Text>
                        </View>
                        <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
                        <Text style={styles.goalMeta}>{timeFrameLabel(s.goal)} · {pct}%</Text>
                      </Pressable>
                    )
                  })}
                </Card>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>{i18n.t('goals:empty.firstGoal', { defaultValue: '—' })}</Text>
          )}
        </ScrollView>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 18 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 24 },
  group: { gap: 8 },
  catName: { fontSize: 14, fontWeight: '600', color: colors.textSub },
  goal: { paddingVertical: 14, paddingHorizontal: 16, gap: 8 },
  goalBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  goalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  goalLabel: { flex: 1, fontSize: 15, color: colors.text },
  goalVal: { fontSize: 13, color: colors.textSub },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(42,37,32,0.08)', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.positive },
  goalMeta: { fontSize: 12, color: colors.textFaint },
})
