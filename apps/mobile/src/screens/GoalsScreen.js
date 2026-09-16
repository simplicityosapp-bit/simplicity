import { useMemo, useState, useRef, useCallback } from 'react'
import { View, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, I18nManager, Alert } from 'react-native'
import { Text } from '../components/Text'
import { Pressable } from '../components/Pressable'
import { useFocusEffect } from '@react-navigation/native'
import { goalsByCategory, formatGoalValue, timeFrameLabel, fmtShortDate } from '@simplicity/core'
import { Star, Plus, X, ChevronDown, ChevronUp, Pencil, Trash2, Target } from 'lucide-react-native'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import ScreenCount from '../components/ScreenCount'
import Card from '../components/Card'
import AddGoalModal from '../modals/AddGoalModal'
import EditGoalModal from '../modals/EditGoalModal'
import AddGoalEntryModal from '../modals/AddGoalEntryModal'
import { goalOwnEntries } from '../lib/goalPresets'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'
import { useGoalsData } from '../hooks/useGoalsData'
import { useQuestions } from '../hooks/useQuestions'
import { useBottomPad } from '../lib/bottomBar'

// Goals screen — goals grouped by category, each scored by the shared core
// engine (goalsByCategory → moonGetData): a pace bar + actual/target value,
// over the per-screen photo (Warm Precision theme). "+" adds a goal. As on web,
// each card edits, deletes (with undo), logs progress on a manual goal and
// lists that goal's own entries, each removable.
export default function GoalsScreen() {
  const bottomPad = useBottomPad()
  const { goals, categories, entries, transactions, clients, leads, answers, members, groups, loading, error, refetch, addGoal, updateGoal, deleteGoal, addEntry, removeEntry } = useGoalsData()
  const { questions, addQuestion, updateQuestion } = useQuestions()
  // Persistent tab: silently re-pull on RE-focus (skip mount).
  const firstFocus = useRef(true)
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return }
    refetch(true)
  }, [refetch]))
  const [showAdd, setShowAdd] = useState(false)
  const [editGoal, setEditGoal] = useState(null)
  const [entryTarget, setEntryTarget] = useState(null) // { goal, cat } a progress entry is being logged for

  const confirmDeleteGoal = (goal) => Alert.alert(
    i18n.t('goals:delete.title'),
    goal.label ? i18n.t('goals:delete.messageNamed', { label: goal.label }) : i18n.t('goals:delete.message'),
    [
      { text: i18n.t('modalsData:common.cancel', { defaultValue: 'ביטול' }), style: 'cancel' },
      { text: i18n.t('goals:delete.confirm'), style: 'destructive', onPress: () => deleteGoal(goal.id).catch(() => {}) },
    ],
  )

  const cats = useMemo(
    () => goalsByCategory(new Date(), { goals, categories, entries, transactions, clients, leads, answers, members, groups }),
    [goals, categories, entries, transactions, clients, leads, answers, members, groups],
  )

  return (
    <Screen name="goals">
      <AddGoalModal open={showAdd} onClose={() => setShowAdd(false)} onSave={addGoal} onAddQuestion={(q) => addQuestion({ ...q, order: questions.length })} />
      <AddGoalEntryModal open={!!entryTarget} onClose={() => setEntryTarget(null)} category={entryTarget?.cat} goal={entryTarget?.goal} onSave={addEntry} />
      <EditGoalModal open={!!editGoal} goal={editGoal} onClose={() => setEditGoal(null)} onSave={updateGoal} onDelete={deleteGoal} categories={categories} questions={questions} onAddQuestion={(q) => addQuestion({ ...q, order: questions.length })} onUpdateQuestion={updateQuestion} />

      {loading && !cats.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, bottomPad]}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          <ScreenHead
            title={i18n.t('goals:title', { defaultValue: 'יעדים' })}
            onAdd={() => setShowAdd(true)}
            addLabel={i18n.t('goals:newGoalAria', { defaultValue: 'יעד חדש' })}
          />
          <ScreenCount>{i18n.t('goals:countLabel', { count: goals.length, defaultValue: `${goals.length} יעדים` })}</ScreenCount>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {cats.length ? (
            cats.map(({ category, goals: scored }) => (
              <View key={category.id} style={styles.group}>
                <Text style={styles.catName}>{category.name || ''}</Text>
                {scored.map((s, i) => (
                  <GoalCard
                    key={s.goal.id || i}
                    scored={s}
                    entries={entries}
                    onEdit={() => setEditGoal(s.goal)}
                    onDelete={() => confirmDeleteGoal(s.goal)}
                    onAddEntry={() => setEntryTarget({ goal: s.goal, cat: s.cat })}
                    onDeleteEntry={removeEntry}
                  />
                ))}
              </View>
            ))
          ) : (
            <View style={styles.emptyBox}>
              <Target size={28} strokeWidth={1.4} color={colors.textSub} />
              <Text style={styles.empty}>{i18n.t('goals:empty.firstGoal', { defaultValue: '—' })}</Text>
              <Pressable style={styles.emptyBtn} onPress={() => setShowAdd(true)} accessibilityRole="button">
                <Plus size={16} strokeWidth={1.8} color={colors.onBtn} />
                <Text style={styles.emptyBtnText}>{i18n.t('goals:empty.setGoal')}</Text>
              </Pressable>
            </View>
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

function GoalCard({ scored: s, entries, onEdit, onDelete, onAddEntry, onDeleteEntry }) {
  const pure = Number.isFinite(s.pure) ? s.pure : 0
  const paced = Number.isFinite(s.paced) ? s.paced : pure
  const importance = s.goal.importance || 3
  const over = pure >= 100
  const flip = (i18n.language || '').startsWith('he') && !I18nManager.isRTL
  const [showHistory, setShowHistory] = useState(false)
  const isManual = s.cat?.measurement_type === 'manual'
  /* An entry only counts inside the goal's own window, so logging against an
     ended goal would save and change nothing — the button isn't offered. The
     history stays: it is the record. */
  const canLog = isManual && !s.ended
  const own = useMemo(() => goalOwnEntries(entries, s.goal, s.cat), [entries, s.goal, s.cat])
  const confirmDeleteEntry = (e) => Alert.alert(
    i18n.t('goals:card.deleteEntryTitle'),
    i18n.t('goals:card.deleteEntryMessage', { value: formatGoalValue(e.value, s.cat), date: fmtShortDate(e.date) }),
    [
      { text: i18n.t('modalsData:common.cancel', { defaultValue: 'ביטול' }), style: 'cancel' },
      { text: i18n.t('goals:card.deleteEntryConfirm'), style: 'destructive', onPress: () => Promise.resolve(onDeleteEntry(e.id)).catch(() => {}) },
    ],
  )
  return (
    <Pressable onPress={onEdit}>
      <Card>
        <View style={[styles.gHead, flip && styles.rowFlip]}>
          <View style={styles.gTitleBlock}>
            <Text style={[styles.gTitle, flip && styles.txtRtl]} numberOfLines={1}>{s.goal.label || s.cat?.name || ''}</Text>
            <View style={[styles.gCatRow, flip && styles.rowFlip]}>
              <View style={[styles.gCatDot, { backgroundColor: s.cat?.color || colors.textSub }]} />
              <Text style={[styles.gCatText, flip && styles.txtRtl]} numberOfLines={1}>{s.cat?.name} · {timeFrameLabel(s.goal)}</Text>
              {/* The deadline has passed — see the web GoalCard. Nothing else on
                  the card would ever admit it: the percentage and the bars read
                  exactly as they did the day before, and cannot change again. */}
              {s.ended ? (
                <Text style={styles.gEnded}>{i18n.t('goals:card.ended', { defaultValue: 'הסתיים' })}</Text>
              ) : null}
            </View>
          </View>
          <Pressable onPress={onEdit} hitSlop={8} accessibilityLabel={i18n.t('goals:card.editAria')} style={styles.gIconBtn}>
            <Pencil size={14} strokeWidth={1.7} color={colors.textSub} />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={8} accessibilityLabel={i18n.t('goals:card.deleteAria')} style={styles.gIconBtn}>
            <Trash2 size={14} strokeWidth={1.7} color={colors.textSub} />
          </Pressable>
          <Text style={[styles.gPct, over && styles.gPctOver]}>{pure}%</Text>
        </View>
        <View style={styles.gBars}>
          <GBar label={i18n.t('moon:dualBars.pace', { defaultValue: 'מהקצב' })} pct={Math.min(100, paced)} color={colors.positive} />
          <GBar label={i18n.t('moon:dualBars.goal', { defaultValue: 'מהיעד' })} pct={pure} color={colors.moonDeep} />
        </View>
        <View style={[styles.gMeta, flip && styles.rowFlip]}>
          <Text style={styles.gTarget}>{formatGoalValue(s.actual, s.cat)} / {formatGoalValue(s.target, s.cat)}</Text>
          <View style={styles.gStars} accessibilityRole="image" accessibilityLabel={i18n.t('goals:card.importanceAria', { importance })}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} size={12} strokeWidth={1.5} color={n <= importance ? colors.amberWarn : colors.textFaint} fill={n <= importance ? colors.amberWarn : 'none'} />
            ))}
          </View>
        </View>
        {canLog || own.length ? (
          <View style={[styles.gEntryBar, flip && styles.rowFlip]}>
            {canLog ? (
              <Pressable style={styles.gEntryAdd} onPress={onAddEntry} accessibilityRole="button">
                <Plus size={14} strokeWidth={1.9} color={colors.brand} />
                <Text style={styles.gEntryAddText}>{i18n.t('goals:card.addEntry')}</Text>
              </Pressable>
            ) : null}
            {own.length ? (
              <Pressable style={styles.gEntryToggle} onPress={() => setShowHistory((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: showHistory }}>
                <Text style={styles.gEntryToggleText}>{i18n.t('goals:card.history')}</Text>
                <Text style={styles.gEntryCount}>{own.length}</Text>
                {showHistory ? <ChevronUp size={14} strokeWidth={1.6} color={colors.textSub} /> : <ChevronDown size={14} strokeWidth={1.6} color={colors.textSub} />}
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {showHistory && own.length ? (
          <View style={styles.gEntries}>
            {own.map((e) => (
              <View key={e.id} style={[styles.gEntryRow, flip && styles.rowFlip]}>
                <Text style={styles.gEntryVal}>{formatGoalValue(e.value, s.cat)}</Text>
                <Text style={styles.gEntryDate}>{fmtShortDate(e.date)}</Text>
                <Text style={styles.gEntryNote} numberOfLines={1}>{e.note ? '· ' + e.note : ''}</Text>
                <Pressable onPress={() => confirmDeleteEntry(e)} hitSlop={8} accessibilityLabel={i18n.t('goals:card.deleteEntryAria')}>
                  <X size={13} strokeWidth={1.8} color={colors.textSub} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </Card>
    </Pressable>
  )
}

const styles = themed((c, t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, gap: 18 },
  error: { color: c.danger, fontSize: 13 },
  empty: { color: c.textFaint, fontSize: 14, textAlign: 'center' },
  emptyBox: { alignItems: 'center', gap: 12, marginTop: 24 },
  emptyBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, borderRadius: 12, backgroundColor: c.btnBg },
  emptyBtnText: { fontSize: 15, fontWeight: '600', color: c.onBtn },
  gIconBtn: { paddingTop: 3 },
  gEntryBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
  gEntryAdd: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 4 },
  gEntryAddText: { fontSize: 13, fontWeight: '600', color: c.brand },
  gEntryToggle: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, marginStart: 'auto' },
  gEntryToggleText: { fontSize: 12, color: c.textSub },
  gEntryCount: { fontSize: 11, fontWeight: '500', color: c.textSub, backgroundColor: c.fillStrong, borderRadius: 10, paddingHorizontal: 7, overflow: 'hidden' },
  gEntries: { marginTop: 6 },
  gEntryRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
  gEntryVal: { fontSize: 13, fontWeight: '500', color: c.text, fontVariant: ['tabular-nums'] },
  gEntryDate: { fontSize: 12, color: c.textSub },
  gEntryNote: { flex: 1, fontSize: 12, color: c.textFaint },
  group: { gap: 10 },
  catName: { fontSize: 11, fontWeight: '600', color: c.textSub, letterSpacing: 0.66, marginHorizontal: 2 },
  // goal card
  gHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  rowFlip: { flexDirection: 'row-reverse' },
  txtRtl: { textAlign: 'right' },
  gTitleBlock: { flex: 1, minWidth: 0 },
  gTitle: { fontSize: 15, fontWeight: '600', color: c.text },
  gCatRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  /* Muted on purpose: a statement of fact about something finished, not a
     warning, sharing a line with the category and the date. */
  gEnded: {
    marginStart: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.textSub,
    fontSize: 10,
    color: c.textSub,
  },
  gCatDot: { width: 8, height: 8, borderRadius: 4 },
  gCatText: { flex: 1, fontSize: 11, color: c.textSub },
  gPct: { fontSize: 20, fontWeight: '500', color: c.text, fontVariant: ['tabular-nums'], lineHeight: 20 },
  gPctOver: { color: c.positive },
  gBars: { flexDirection: 'row', gap: 14 },
  gMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  gTarget: { fontSize: 13, fontWeight: '500', color: c.textSub, fontVariant: ['tabular-nums'] },
  gStars: { flexDirection: 'row', gap: 2 },
  // dual bar column
  gbarCol: { flex: 1, gap: 4 },
  gbarHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gbarLbl: { fontSize: 11, color: c.textSub },
  gbarVal: { fontSize: 11, fontWeight: '500', color: c.textSub, fontVariant: ['tabular-nums'] },
  gbarTrack: { height: 5, borderRadius: 3, backgroundColor: c.divider, overflow: 'hidden' },
  gbarFill: { height: 5, borderRadius: 3 },
}))
