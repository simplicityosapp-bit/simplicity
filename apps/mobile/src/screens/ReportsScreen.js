import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import {
  BarChart3, Leaf, XCircle, ArrowRight, TrendingUp, Users, CircleCheck, CircleAlert,
  Calendar, ArrowDownCircle, ArrowUpCircle, Coins, Check,
} from 'lucide-react-native'
import { REPORT_METRICS, REPORT_GROUPS, computeReportForRange, getLast12Months, formatReportValue } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import { colors } from '../theme/theme'
import { useReportsData } from '../hooks/useReportsData'

const METRIC_ICONS = {
  newInquiries: Leaf, leadsClosed: XCircle, leadsConverted: ArrowRight, conversionRate: TrendingUp,
  newClients: Users, activeClientsAtEnd: CircleCheck, leftMidProcessPct: CircleAlert,
  sessions: Calendar, income: ArrowDownCircle, expense: ArrowUpCircle, net: Coins,
  tasksCompleted: Check, openTasksAtEnd: CircleAlert,
}

// Reports (mirrors web ReportsScreen, list view): pick a month → the shared
// report engine computes every metric for that range, grouped by domain. The
// customize / drill-down / table-view are deferred; this shows all metrics.
export default function ReportsScreen() {
  const { leads, clients, sessions, transactions, tasks, groupMembers, groups, loading, error, refetch } = useReportsData()
  const periods = useMemo(() => getLast12Months(new Date(), i18n.language), [])
  const [idx, setIdx] = useState(periods.length - 1) // current month
  const period = periods[idx]

  const report = useMemo(
    () => computeReportForRange(period.start, period.end, { leads, clients, sessions, transactions, tasks, groupMembers, groups }),
    [period, leads, clients, sessions, transactions, tasks, groupMembers, groups],
  )
  const metricVal = (id) => report?.metrics?.[id]

  return (
    <Screen name="finance">
      <ScreenHead
        title={i18n.t('reports:title', { defaultValue: 'דוחות' })}
        meta={[period.label]}
        tagline={i18n.t('reports:tagline', { defaultValue: 'המספרים מספרים את הסיפור.' })}
      />

      {loading && !clients.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Month selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
            {periods.map((p, i) => {
              const on = i === idx
              return (
                <Pressable key={p.label} style={[styles.pill, on && styles.pillOn]} onPress={() => setIdx(i)}>
                  <Text style={[styles.pillText, on && styles.pillTextOn]}>{p.label}</Text>
                </Pressable>
              )
            })}
          </ScrollView>

          {REPORT_GROUPS.map((g) => {
            const metrics = REPORT_METRICS.filter((m) => m.group === g.id)
            return (
              <View key={g.id} style={styles.group}>
                <Text style={styles.groupTitle}>{i18n.t(`reports:groups.${g.id}`)}</Text>
                <Card padded={false}>
                  {metrics.map((m, i) => {
                    const Icon = METRIC_ICONS[m.id] || BarChart3
                    return (
                      <View key={m.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                        <Icon size={15} strokeWidth={1.6} color={colors.textSub} />
                        <Text style={styles.rowLabel}>{i18n.t(`reports:metrics.${m.id}`)}</Text>
                        <Text style={styles.rowValue}>{formatReportValue(m, metricVal(m.id))}</Text>
                      </View>
                    )
                  })}
                </Card>
              </View>
            )
          })}
        </ScrollView>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  error: { color: colors.danger, fontSize: 13 },
  pills: { gap: 8, paddingVertical: 2 },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat },
  pillOn: { backgroundColor: colors.text, borderColor: colors.text },
  pillText: { fontSize: 13, color: colors.textSub },
  pillTextOn: { color: colors.onBrand, fontWeight: '600' },
  group: { gap: 8 },
  groupTitle: { fontSize: 14, fontWeight: '600', color: colors.textSub, marginHorizontal: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  rowLabel: { flex: 1, fontSize: 14, color: colors.text },
  rowValue: { fontSize: 15, fontWeight: '600', color: colors.text },
})
