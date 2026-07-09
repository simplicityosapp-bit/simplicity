import { useMemo, useState, useRef, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { goalsByCategory, formatGoalValue, timeFrameLabel } from '@simplicity/core'
import { Star } from 'lucide-react-native'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import AddGoalModal from '../modals/AddGoalModal'
import EditGoalModal from '../modals/EditGoalModal'
import { colors } from '../theme/theme'
import { useGoalsData } from '../hooks/useGoalsData'
import { useQuestions } from '../hooks/useQuestions'

// Goals screen — goals grouped by category, each scored by the shared core
// engine (goalsByCategory → moonGetData): a pace bar + actual/target value,
// over the per-screen photo (Warm Precision theme). "+" adds a goal.
export default function GoalsScreen() {
  const { goals, categories, entries, transactions, clients, leads, answers, members, groups, loading, error, refetch, addGoal, updateGoal, deleteGoal } = useGoalsData()
  const { questions, addQuestion, updateQuestion } = useQuestions()
  // Persistent tab: silently re-pull on RE-focus (skip mount).
  const firstFocus = useRef(true)
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return }
    refetch(true)
  }, [refetch]))
  const [showAdd, setShowAdd] = useState(false)
  const [editGoal, setEditGoal] = useState(null)

  const cats = useMemo(
    () => goalsByCategory(new Date(), { goals, categories, entries, transactions, clients, leads, answers, members, groups }),
    [goals, categories, entries, transactions, clients, leads, answers, members, groups],
  )

  return (
    <Screen name="goals">
      <AddGoalModal open={showAdd} onClose={() => setShowAdd(false)} onSave={addGoal} onAddQuestion={(q) => addQuestion({ ...q, order: questions.length })} />
      <EditGoalModal open={!!editGoal} goal={editGoal} onClose={() => setEditGoal(null)} onSave={updateGoal} onDelete={deleteGoal} categories={categories} questions={questions} onAddQuestion={(q) => addQuestion({ ...q, order: questions.length })} onUpdateQuestion={updateQuestion} />

      {loading && !cats.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          <ScreenHead
            title={i18n.t('goals:title', { defaultValue: 'יעדים' })}
            meta={[i18n.t('goals:countLabel', { count: goals.length, defaultValue: `${goals.length} יעדים` })]}
            tagline={i18n.t('goals:tagline', { defaultValue: 'כל יעד — כיוון, לא לחץ.' })}
            onAdd={() => setShowAdd(true)}
            addLabel={i18n.t('goals:newGoalAria', { defaultValue: 'יעד חדש' })}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {cats.length ? (
            cats.map(({ category, goals: scored }) => (
              <View key={category.id} style={styles.group}>
                <Text style={styles.catName}>{category.name || ''}</Text>
                {scored.map((s, i) => (
                  <GoalCard key={s.goal.id || i} scored={s} onEdit={() => setEditGoal(s.goal)} />
                ))}
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

// One goal = its own glass card, mirroring web GoalCard: title + category
// dot/timeframe, a big mono percent (sage + "+" when ≥100%), pace-vs-goal dual
// bars, and an actual/target line beside a 5-star importance rating.
function GBar({ label, pct, color }) {
  const w = Math.min(100, Math.max(0, pct ?? 0))
  return (
    <View style={styles.gbarCol}>
      <View style={styles.gbarHead}>
        <Text style={styles.gbarLbl}>{label}</Text>
        <Text style={styles.gbarVal}>{w}%</Text>
      </View>
      <View style={styles.gbarTrack}><View style={[styles.gbarFill, { width: `${w}%`, backgroundColor: color }]} /></View>
    </View>
  )
}

function GoalCard({ scored: s, onEdit }) {
  const pure = Number.isFinite(s.pure) ? s.pure : 0
  const paced = Number.isFinite(s.paced) ? s.paced : pure
  const importance = s.goal.importance || 3
  const over = pure >= 100
  return (
    <Pressable onPress={onEdit}>
      <Card>
        <View style={styles.gHead}>
          <View style={styles.gTitleBlock}>
            <Text style={styles.gTitle} numberOfLines={1}>{s.goal.label || s.cat?.name || ''}</Text>
            <View style={styles.gCatRow}>
              <View style={[styles.gCatDot, { backgroundColor: s.cat?.color || colors.textSub }]} />
              <Text style={styles.gCatText} numberOfLines={1}>{s.cat?.name} · {timeFrameLabel(s.goal)}</Text>
            </View>
          </View>
          <Text style={[styles.gPct, over && styles.gPctOver]}>{Math.min(pure, 100)}%{pure > 100 ? '+' : ''}</Text>
        </View>
        <View style={styles.gBars}>
          <GBar label={i18n.t('moon:dualBars.pace', { defaultValue: 'מהקצב' })} pct={Math.min(100, paced)} color={colors.positive} />
          <GBar label={i18n.t('moon:dualBars.goal', { defaultValue: 'מהיעד' })} pct={pure} color={colors.moonDeep} />
        </View>
        <View style={styles.gMeta}>
          <Text style={styles.gTarget}>{formatGoalValue(s.actual, s.cat)} / {formatGoalValue(s.target, s.cat)}</Text>
          <View style={styles.gStars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} size={12} strokeWidth={1.5} color={n <= importance ? colors.amberWarn : colors.textFaint} fill={n <= importance ? colors.amberWarn : 'none'} />
            ))}
          </View>
        </View>
      </Card>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 96, gap: 18 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 24 },
  group: { gap: 10 },
  catName: { fontSize: 11, fontWeight: '600', color: colors.textSub, letterSpacing: 0.66, marginHorizontal: 2 },
  // goal card
  gHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  gTitleBlock: { flex: 1, minWidth: 0 },
  gTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  gCatRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  gCatDot: { width: 8, height: 8, borderRadius: 4 },
  gCatText: { flex: 1, fontSize: 11, color: colors.textSub },
  gPct: { fontSize: 20, fontWeight: '500', color: colors.text, fontVariant: ['tabular-nums'], lineHeight: 20 },
  gPctOver: { color: colors.positive },
  gBars: { flexDirection: 'row', gap: 14 },
  gMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  gTarget: { fontSize: 13, fontWeight: '500', color: colors.textSub, fontVariant: ['tabular-nums'] },
  gStars: { flexDirection: 'row', gap: 2 },
  // dual bar column
  gbarCol: { flex: 1, gap: 4 },
  gbarHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gbarLbl: { fontSize: 11, color: colors.textSub },
  gbarVal: { fontSize: 11, fontWeight: '500', color: colors.textSub, fontVariant: ['tabular-nums'] },
  gbarTrack: { height: 5, borderRadius: 3, backgroundColor: colors.divider, overflow: 'hidden' },
  gbarFill: { height: 5, borderRadius: 3 },
})
