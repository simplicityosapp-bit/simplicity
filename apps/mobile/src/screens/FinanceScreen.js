import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { financeQuery, currentMonthRange, monthNet, isr, fmtShortDate } from '@simplicity/core'
import i18n from '../lib/i18n'
import { useFinanceData } from '../hooks/useFinanceData'

// Real Finance screen (replaces the stub). Month summary (net / income /
// expense, all from core) + the month's confirmed transactions.
export default function FinanceScreen() {
  const nav = useNavigation()
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
    <View style={styles.root}>
      <View style={styles.bar}>
        <Pressable onPress={() => nav.goBack()} hitSlop={10}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.title}>{i18n.t('finance:title', { defaultValue: 'כסף' })}</Text>
        <View style={styles.spacer} />
      </View>

      {loading && !transactions.length ? (
        <View style={styles.center}><ActivityIndicator color="#C97B5E" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#C97B5E" />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.summary}>
            <Text style={styles.sumLabel}>{i18n.t('finance:summary.netThisMonth', { defaultValue: 'נטו החודש' })}</Text>
            <Text style={[styles.sumNet, { color: net >= 0 ? '#5a8f6b' : '#c0392b' }]}>{isr(net)}</Text>
            <View style={styles.sumRow}>
              <Text style={styles.sumSub}>{i18n.t('finance:summary.income', { defaultValue: 'הכנסות' })} {isr(inc)}</Text>
              <Text style={styles.sumSub}>{i18n.t('finance:summary.expenses', { defaultValue: 'הוצאות' })} {isr(exp)}</Text>
            </View>
          </View>

          {monthTx.length ? (
            <View style={styles.card}>
              {monthTx.map((t, i) => {
                const income = t.type === 'income'
                return (
                  <View key={t.id || i} style={[styles.row, i > 0 && styles.rowBorder]}>
                    <View style={styles.info}>
                      <Text style={styles.desc} numberOfLines={1}>{t.desc || '—'}</Text>
                      <Text style={styles.date}>{fmtShortDate(t.date)}</Text>
                    </View>
                    <Text style={[styles.amount, { color: income ? '#5a8f6b' : '#8a7f72' }]}>
                      {income ? '+' : '−'}{isr(t.amount)}
                    </Text>
                  </View>
                )
              })}
            </View>
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
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  error: { color: '#c0392b', fontSize: 13 },
  empty: { color: '#a89f95', fontSize: 14, textAlign: 'center', marginTop: 24 },
  summary: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#efe7da', paddingVertical: 20, paddingHorizontal: 20, gap: 6, alignItems: 'center' },
  sumLabel: { fontSize: 13, color: '#7c6f63' },
  sumNet: { fontSize: 32, fontWeight: '600' },
  sumRow: { flexDirection: 'row', gap: 20, marginTop: 4 },
  sumSub: { fontSize: 13, color: '#a89f95' },
  card: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#efe7da', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#f2ece1' },
  info: { flex: 1, gap: 2 },
  desc: { fontSize: 15, color: '#3a342e' },
  date: { fontSize: 12, color: '#a89f95' },
  amount: { fontSize: 15, fontWeight: '600' },
})
