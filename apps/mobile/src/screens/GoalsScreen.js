import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { goalsByCategory, formatGoalValue, timeFrameLabel } from '@simplicity/core'
import i18n from '../lib/i18n'
import { useGoalsData } from '../hooks/useGoalsData'

// Real Goals screen (replaces the stub). Goals grouped by category, each scored
// by the shared core engine (goalsByCategory → moonGetData): a pace bar +
// actual/target value.
export default function GoalsScreen() {
  const nav = useNavigation()
  const { goals, categories, entries, transactions, clients, leads, answers, members, groups, loading, error, refetch } = useGoalsData()

  const cats = useMemo(
    () => goalsByCategory(new Date(), { goals, categories, entries, transactions, clients, leads, answers, members, groups }),
    [goals, categories, entries, transactions, clients, leads, answers, members, groups],
  )

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <Pressable onPress={() => nav.goBack()} hitSlop={10}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.title}>{i18n.t('goals:title', { defaultValue: 'יעדים' })}</Text>
        <View style={styles.spacer} />
      </View>

      {loading && !cats.length ? (
        <View style={styles.center}><ActivityIndicator color="#C97B5E" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#C97B5E" />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {cats.length ? (
            cats.map(({ category, goals: scored }) => (
              <View key={category.id} style={styles.group}>
                <Text style={styles.catName}>{category.name || ''}</Text>
                <View style={styles.card}>
                  {scored.map((s, i) => {
                    const pct = Math.min(100, Math.max(0, s.pure ?? 0))
                    return (
                      <View key={s.goal.id || i} style={[styles.goal, i > 0 && styles.goalBorder]}>
                        <View style={styles.goalHead}>
                          <Text style={styles.goalLabel} numberOfLines={1}>{s.goal.label || category.name || ''}</Text>
                          <Text style={styles.goalVal}>{formatGoalValue(s.actual, s.cat)} / {formatGoalValue(s.target, s.cat)}</Text>
                        </View>
                        <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
                        <Text style={styles.goalMeta}>{timeFrameLabel(s.goal)} · {pct}%</Text>
                      </View>
                    )
                  })}
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>—</Text>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const BRAND = '#C97B5E'
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fbf7f2' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: 12, paddingHorizontal: 16, gap: 8 },
  back: { fontSize: 30, color: BRAND, lineHeight: 30 },
  title: { fontSize: 18, fontWeight: '600', color: '#3a342e', flex: 1, textAlign: 'center' },
  spacer: { width: 30 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 18 },
  error: { color: '#c0392b', fontSize: 13 },
  empty: { color: '#a89f95', fontSize: 14, textAlign: 'center', marginTop: 24 },
  group: { gap: 8 },
  catName: { fontSize: 14, fontWeight: '600', color: '#7c6f63' },
  card: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#efe7da', overflow: 'hidden' },
  goal: { paddingVertical: 14, paddingHorizontal: 16, gap: 8 },
  goalBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#f2ece1' },
  goalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  goalLabel: { flex: 1, fontSize: 15, color: '#3a342e' },
  goalVal: { fontSize: 13, color: '#7c6f63' },
  track: { height: 8, borderRadius: 4, backgroundColor: '#efe7da', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: '#8BA888' },
  goalMeta: { fontSize: 12, color: '#a89f95' },
})
