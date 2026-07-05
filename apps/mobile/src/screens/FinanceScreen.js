import { useMemo } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { financeQuery, currentMonthRange, monthNet, isr, fmtShortDate } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHeader from '../components/ScreenHeader'
import Card from '../components/Card'
import { colors } from '../theme/theme'
import { useFinanceData } from '../hooks/useFinanceData'

// Finance screen — month summary (net / income / expenses, all from core) + the
// month's confirmed transactions, over the per-screen photo (Warm Precision).
export default function FinanceScreen() {
  const { transactions, loading, error, refetch } = useFinanceData()
  const now = new Date()

  const { inc, exp, net } = useMemo(() => monthNet(now, { transactions }), [transactions]) // eslint-disable-line react-hooks/exhaustive-deps
  const monthTx = useMemo(
    () => financeQuery({ ...currentMonthRange(now), source: transactions })
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [transactions], // eslint-disable-line react-hooks/exhaustive-deps
  )

  return (
    <Screen name="finance">
      <ScreenHeader title={i18n.t('finance:title', { defaultValue: 'כסף' })} />

      {loading && !transactions.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Card contentStyle={styles.summary}>
            <Text style={styles.sumLabel}>{i18n.t('finance:summary.netThisMonth', { defaultValue: 'נטו החודש' })}</Text>
            <Text style={[styles.sumNet, { color: net >= 0 ? colors.positive : colors.danger }]}>{isr(net)}</Text>
            <View style={styles.sumRow}>
              <Text style={styles.sumSub}>{i18n.t('finance:summary.income', { defaultValue: 'הכנסות' })} {isr(inc)}</Text>
              <Text style={styles.sumSub}>{i18n.t('finance:summary.expenses', { defaultValue: 'הוצאות' })} {isr(exp)}</Text>
            </View>
          </Card>

          {monthTx.length ? (
            <Card padded={false}>
              {monthTx.map((t, i) => {
                const income = t.type === 'income'
                return (
                  <View key={t.id || i} style={[styles.row, i > 0 && styles.rowBorder]}>
                    <View style={styles.info}>
                      <Text style={styles.desc} numberOfLines={1}>{t.desc || '—'}</Text>
                      <Text style={styles.date}>{fmtShortDate(t.date)}</Text>
                    </View>
                    <Text style={[styles.amount, { color: income ? colors.positive : colors.textSub }]}>
                      {income ? '+' : '−'}{isr(t.amount)}
                    </Text>
                  </View>
                )
              })}
            </Card>
          ) : (
            <Text style={styles.empty}>—</Text>
          )}
        </ScrollView>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 24 },
  summary: { paddingVertical: 20, paddingHorizontal: 20, gap: 6, alignItems: 'center' },
  sumLabel: { fontSize: 13, color: colors.textSub },
  sumNet: { fontSize: 32, fontWeight: '600' },
  sumRow: { flexDirection: 'row', gap: 20, marginTop: 4 },
  sumSub: { fontSize: 13, color: colors.textFaint },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  info: { flex: 1, gap: 2 },
  desc: { fontSize: 15, color: colors.text },
  date: { fontSize: 12, color: colors.textFaint },
  amount: { fontSize: 15, fontWeight: '600' },
})
