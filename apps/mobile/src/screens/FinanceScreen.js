import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { financeQuery, currentMonthRange, monthNet, isr, fmtShortDate, fmtMonthYear, payMethodLabel } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import AddTransactionModal from '../modals/AddTransactionModal'
import { colors } from '../theme/theme'
import { useFinanceData } from '../hooks/useFinanceData'

// Finance screen — a month summary you can page through (prev/next), the month's
// confirmed transactions, and a pending-approval section (tap a row to edit/
// approve). Rows show client · category · payment. Over the per-screen photo.
export default function FinanceScreen() {
  const { transactions, clients, categories, loading, error, refetch, addTransaction, updateTransaction, deleteTransaction } = useFinanceData()
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [monthOffset, setMonthOffset] = useState(0)
  const now = new Date()
  const monthDate = useMemo(() => new Date(now.getFullYear(), now.getMonth() + monthOffset, 1), [monthOffset]) // eslint-disable-line react-hooks/exhaustive-deps

  const clientById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.name])), [clients])
  const categoryById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories])

  const { inc, exp, net } = useMemo(() => monthNet(monthDate, { transactions }), [monthDate, transactions])
  const prevNet = useMemo(() => monthNet(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1), { transactions }).net, [monthDate, transactions])
  const delta = net - prevNet
  const monthTx = useMemo(
    () => financeQuery({ ...currentMonthRange(monthDate), source: transactions })
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [monthDate, transactions],
  )
  const pending = useMemo(
    () => transactions.filter((t) => !t.deleted_at && t.status === 'pending').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [transactions],
  )

  const txMeta = (t) => [
    clientById[t.client_id] || t.recipient_name,
    t.type === 'expense' ? categoryById[t.category_id] : null,
    payMethodLabel(t.payment_method),
  ].filter(Boolean).join(' · ')

  const renderTx = (list) => list.map((t, i) => {
    const income = t.type === 'income'
    const meta = txMeta(t)
    return (
      <Pressable key={t.id || i} style={[styles.row, i > 0 && styles.rowBorder]} onPress={() => setEditing(t)}>
        <View style={styles.info}>
          <Text style={styles.desc} numberOfLines={1}>{t.desc || '—'}</Text>
          <Text style={styles.date} numberOfLines={1}>{fmtShortDate(t.date)}{meta ? ` · ${meta}` : ''}</Text>
        </View>
        <Text style={[styles.amount, { color: income ? colors.positive : colors.textSub }]}>{income ? '+' : '−'}{isr(t.amount)}</Text>
      </Pressable>
    )
  })

  return (
    <Screen name="finance">
      <ScreenHead
        title={i18n.t('finance:title', { defaultValue: 'כסף' })}
        meta={[i18n.t('finance:countLabel', { count: monthTx.length }), i18n.t('finance:snapshot', { defaultValue: 'תמונת מצב' })]}
        tagline={i18n.t('finance:tagline', { defaultValue: 'הפעולות שלך יוצרות תוצאות טובות.' })}
        onAdd={() => setAdding(true)}
        addLabel={i18n.t('finance:newTxAria', { defaultValue: 'תנועה חדשה' })}
      />

      {loading && !transactions.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {pending.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{i18n.t('finance:pending.count', { count: pending.length })}</Text>
              <Card padded={false}>{renderTx(pending)}</Card>
            </View>
          ) : null}

          <Card contentStyle={styles.summary}>
            <View style={styles.monthNav}>
              <Pressable onPress={() => setMonthOffset((o) => o - 1)} hitSlop={10}><ChevronRight size={22} strokeWidth={1.8} color={colors.brand} /></Pressable>
              <Text style={styles.monthLabel}>{fmtMonthYear(monthDate)}</Text>
              <Pressable onPress={() => setMonthOffset((o) => Math.min(0, o + 1))} hitSlop={10} disabled={monthOffset >= 0}>
                <ChevronLeft size={22} strokeWidth={1.8} color={monthOffset >= 0 ? colors.textFaint : colors.brand} />
              </Pressable>
            </View>
            <Text style={[styles.sumNet, { color: net >= 0 ? colors.positive : colors.danger }]}>{isr(net)}</Text>
            <View style={styles.sumRow}>
              <Text style={styles.sumSub}>{i18n.t('finance:summary.income', { defaultValue: 'הכנסות' })} {isr(inc)}</Text>
              <Text style={styles.sumSub}>{i18n.t('finance:summary.expenses', { defaultValue: 'הוצאות' })} {isr(exp)}</Text>
            </View>
            {delta !== 0 ? (
              <Text style={[styles.delta, { color: delta >= 0 ? colors.positive : colors.danger }]}>
                {delta >= 0 ? '▲' : '▼'} {isr(Math.abs(delta))} {i18n.t('finance:summary.vsPrevMonth', { defaultValue: 'מהחודש הקודם' })}
              </Text>
            ) : null}
          </Card>

          {monthTx.length ? (
            <Card padded={false}>{renderTx(monthTx)}</Card>
          ) : (
            <Text style={styles.empty}>{i18n.t('finance:list.empty', { defaultValue: '—' })}</Text>
          )}
        </ScrollView>
      )}

      <AddTransactionModal open={adding} clients={clients} onClose={() => setAdding(false)} onSave={addTransaction} />
      <AddTransactionModal
        open={!!editing}
        tx={editing}
        clients={clients}
        categories={categories}
        onClose={() => setEditing(null)}
        onSave={(patch) => updateTransaction(editing.id, patch)}
        onDelete={() => deleteTransaction(editing.id)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 24 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.textSub },
  summary: { paddingVertical: 18, paddingHorizontal: 20, gap: 6, alignItems: 'center' },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' },
  monthLabel: { fontSize: 14, fontWeight: '600', color: colors.textSub },
  sumNet: { fontSize: 32, fontWeight: '600' },
  sumRow: { flexDirection: 'row', gap: 20, marginTop: 4 },
  sumSub: { fontSize: 13, color: colors.textFaint },
  delta: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  info: { flex: 1, gap: 2 },
  desc: { fontSize: 15, color: colors.text },
  date: { fontSize: 12, color: colors.textFaint },
  amount: { fontSize: 15, fontWeight: '600' },
})
