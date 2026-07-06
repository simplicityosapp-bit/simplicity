import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { ChevronLeft, ChevronRight, FolderOpen, Tag, Check, SkipForward, Settings2, Repeat, Pause, Play, Pencil, Trash2, Plus } from 'lucide-react-native'
import { monthNet, describeCadence, isr, fmtShortDate, fmtMonthYear, payMethodLabel } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import { GlassPressable } from '../components/Glass'
import AddTransactionModal from '../modals/AddTransactionModal'
import FinanceCategoriesModal from '../modals/FinanceCategoriesModal'
import RecurringModal from '../modals/RecurringModal'
import FinanceChart from './finance/FinanceChart'
import { colors } from '../theme/theme'
import { useFinanceData } from '../hooks/useFinanceData'
import { useRecurring } from '../hooks/useRecurring'
import { useFormOptions } from '../lib/formOptions'

const sameMonth = (d, m) => { const x = new Date(d); return x.getFullYear() === m.getFullYear() && x.getMonth() === m.getMonth() }
const isConfirmed = (t) => t.status === 'confirmed' && !t.invoice_credited_at

// Finance screen (mirrors web screens/finance): month summary (nav + net + MoM),
// income-by-project + expenses-by-category breakdowns, a pending-approval section
// (approve/skip), and the month's transactions with a skipped toggle. Manage
// expense categories from the breakdown header. (Recurring templates, chart and
// invoice imports are a later increment.)
export default function FinanceScreen() {
  const { transactions, clients, categories, loading, error, refetch, addTransaction, updateTransaction, deleteTransaction, setStatus, addCategory, removeCategory } = useFinanceData()
  const { projects } = useFormOptions()
  const { templates, addRecurring, updateRecurring, removeRecurring } = useRecurring()
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [manageCat, setManageCat] = useState(false)
  const [showSkipped, setShowSkipped] = useState(false)
  const [addRec, setAddRec] = useState(false)
  const [editRec, setEditRec] = useState(null)
  const [monthOffset, setMonthOffset] = useState(0)
  const now = new Date()
  const monthDate = useMemo(() => new Date(now.getFullYear(), now.getMonth() + monthOffset, 1), [monthOffset]) // eslint-disable-line react-hooks/exhaustive-deps

  const clientById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.name])), [clients])
  const categoryById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories])
  const projectOf = useMemo(() => new Map(clients.filter((c) => c.project_id).map((c) => [c.id, c.project_id])), [clients])
  const projectById = useMemo(() => Object.fromEntries((projects || []).map((p) => [p.id, p])), [projects])
  const liveTemplates = useMemo(() => templates.filter((t) => !t.deleted_at), [templates])

  const { inc, exp, net } = useMemo(() => monthNet(monthDate, { transactions }), [monthDate, transactions])
  const prevNet = useMemo(() => monthNet(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1), { transactions }).net, [monthDate, transactions])
  const delta = net - prevNet

  const monthTxs = useMemo(
    () => transactions.filter((t) => !t.deleted_at && sameMonth(t.date, monthDate)),
    [transactions, monthDate],
  )
  const pending = useMemo(() => monthTxs.filter((t) => t.status === 'pending').sort((a, b) => new Date(a.date) - new Date(b.date)), [monthTxs])
  const skippedCount = useMemo(() => monthTxs.filter((t) => t.status === 'skipped').length, [monthTxs])
  const listTx = useMemo(
    () => monthTxs.filter((t) => showSkipped || t.status !== 'skipped').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [monthTxs, showSkipped],
  )

  // Income by project (confirmed income; project_id or client's project).
  const incomeRows = useMemo(() => {
    const totals = new Map()
    monthTxs.forEach((t) => {
      if (t.type !== 'income' || !isConfirmed(t)) return
      const pid = t.project_id || (t.client_id ? projectOf.get(t.client_id) : null) || null
      totals.set(pid, (totals.get(pid) || 0) + Number(t.amount || 0))
    })
    const max = Math.max(0, ...totals.values())
    return [...totals].filter(([, s]) => s).map(([pid, sum]) => {
      const p = pid ? projectById[pid] : null
      return { id: pid || 'none', name: p?.name || i18n.t('finance:incomeByProject.noProject', { defaultValue: 'ללא פרויקט' }), color: p?.color || colors.textSub, sum, pct: max > 0 ? Math.round((sum / max) * 100) : 0 }
    }).sort((a, b) => b.sum - a.sum)
  }, [monthTxs, projectOf, projectById])
  // Expenses by category (confirmed expenses).
  const expenseRows = useMemo(() => {
    const totals = new Map()
    monthTxs.forEach((t) => {
      if (t.type !== 'expense' || !isConfirmed(t)) return
      totals.set(t.category_id || null, (totals.get(t.category_id || null) || 0) + Number(t.amount || 0))
    })
    const max = Math.max(0, ...totals.values())
    return [...totals].filter(([, s]) => s).map(([cid, sum]) => {
      const c = cid ? categories.find((x) => x.id === cid) : null
      return { id: cid || 'none', name: c?.name || i18n.t('finance:expensesByCategory.noCategory', { defaultValue: 'ללא קטגוריה' }), color: c?.color || colors.textSub, sum, pct: max > 0 ? Math.round((sum / max) * 100) : 0 }
    }).sort((a, b) => b.sum - a.sum)
  }, [monthTxs, categories])

  const txMeta = (t) => [clientById[t.client_id] || t.recipient_name, t.type === 'expense' ? categoryById[t.category_id] : null, payMethodLabel(t.payment_method)].filter(Boolean).join(' · ')

  const renderRow = (t, i, opts = {}) => {
    const income = t.type === 'income'
    const meta = txMeta(t)
    return (
      <View key={t.id || i} style={[styles.row, i > 0 && styles.rowBorder]}>
        <Pressable style={styles.info} onPress={() => setEditing(t)}>
          <Text style={[styles.desc, t.status === 'skipped' && styles.skippedText]} numberOfLines={1}>{t.desc || '—'}</Text>
          <Text style={styles.date} numberOfLines={1}>{fmtShortDate(t.date)}{meta ? ` · ${meta}` : ''}{t.status === 'skipped' ? ` · ${i18n.t('finance:list.skippedTag', { defaultValue: 'דולג' })}` : ''}</Text>
        </Pressable>
        {opts.pending ? (
          <View style={styles.actions}>
            <Pressable style={styles.approve} onPress={() => setStatus(t.id, 'confirmed')} hitSlop={6}><Check size={16} strokeWidth={2.2} color={colors.positive} /></Pressable>
            <Pressable style={styles.skip} onPress={() => setStatus(t.id, 'skipped')} hitSlop={6}><SkipForward size={15} strokeWidth={1.8} color={colors.textFaint} /></Pressable>
          </View>
        ) : (
          <Text style={[styles.amount, { color: income ? colors.positive : colors.textSub }]}>{income ? '+' : '−'}{isr(t.amount)}</Text>
        )}
      </View>
    )
  }

  return (
    <Screen name="finance">
      <ScreenHead
        title={i18n.t('finance:title', { defaultValue: 'כסף' })}
        meta={[i18n.t('finance:countLabel', { count: monthTxs.length }), i18n.t('finance:snapshot', { defaultValue: 'תמונת מצב' })]}
        tagline={i18n.t('finance:tagline', { defaultValue: 'הפעולות שלך יוצרות תוצאות טובות.' })}
        onAdd={() => setAdding(true)}
        addLabel={i18n.t('finance:newTxAria', { defaultValue: 'תנועה חדשה' })}
      />

      {loading && !transactions.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Pending approval */}
          {pending.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{i18n.t('finance:pending.count', { count: pending.length })}</Text>
              <Card padded={false}>{pending.map((t, i) => renderRow(t, i, { pending: true }))}</Card>
            </View>
          ) : null}

          {/* Month summary */}
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

          {/* Income-pace chart */}
          <FinanceChart month={monthDate} transactions={transactions} />

          {/* Recurring templates */}
          <Card contentStyle={styles.rec}>
            <View style={styles.recHead}>
              <Repeat size={15} strokeWidth={1.6} color={colors.textSub} />
              <Text style={styles.recTitle}>{i18n.t('finance:recurring.title', { defaultValue: 'תבניות חוזרות' })}</Text>
              {liveTemplates.length ? <Text style={styles.bdCount}>{liveTemplates.length}</Text> : null}
              <View style={{ flex: 1 }} />
              <Pressable style={styles.recAdd} onPress={() => setAddRec(true)} hitSlop={6}>
                <Plus size={14} strokeWidth={2} color={colors.brand} />
                <Text style={styles.recAddText}>{i18n.t('finance:recurring.add', { defaultValue: '+ תבנית חדשה' })}</Text>
              </Pressable>
            </View>
            {liveTemplates.length ? liveTemplates.map((tpl, i) => {
              const income = tpl.type === 'income'
              const paused = !tpl.active
              return (
                <View key={tpl.id} style={[styles.recRow, i > 0 && styles.rowBorder, paused && styles.recPaused]}>
                  <View style={styles.recMain}>
                    <Text style={styles.recDesc} numberOfLines={1}>{tpl.desc || (income ? i18n.t('finance:recurring.income', { defaultValue: 'הכנסה' }) : i18n.t('finance:recurring.expense', { defaultValue: 'הוצאה' }))}</Text>
                    <Text style={styles.recMeta} numberOfLines={1}>{describeCadence(tpl)}{paused ? ` · ${i18n.t('finance:recurring.paused', { defaultValue: 'מושהה' })}` : ''}</Text>
                  </View>
                  <Text style={[styles.recAmt, { color: income ? colors.positive : colors.textSub }]}>{income ? '+' : '−'}{isr(Math.abs(tpl.amount || 0))}</Text>
                  <View style={styles.recActions}>
                    <Pressable onPress={() => updateRecurring(tpl.id, { active: !tpl.active })} hitSlop={6}>{paused ? <Play size={15} strokeWidth={1.7} color={colors.textSub} /> : <Pause size={15} strokeWidth={1.7} color={colors.textSub} />}</Pressable>
                    <Pressable onPress={() => setEditRec(tpl)} hitSlop={6}><Pencil size={14} strokeWidth={1.7} color={colors.textSub} /></Pressable>
                    <Pressable onPress={() => removeRecurring(tpl.id)} hitSlop={6}><Trash2 size={14} strokeWidth={1.7} color={colors.danger} /></Pressable>
                  </View>
                </View>
              )
            }) : <Text style={styles.bdEmpty}>{i18n.t('finance:recurring.empty', { defaultValue: 'אין תבניות חוזרות עדיין.' })}</Text>}
          </Card>

          {/* Breakdowns */}
          <Breakdown Icon={FolderOpen} title={i18n.t('finance:incomeByProject.title', { defaultValue: 'הכנסות לפי פרויקט' })} rows={incomeRows} empty={i18n.t('finance:incomeByProject.empty', { defaultValue: '—' })} />
          <Breakdown
            Icon={Tag}
            title={i18n.t('finance:expensesByCategory.title', { defaultValue: 'הוצאות לפי קטגוריה' })}
            rows={expenseRows}
            empty={i18n.t('finance:expensesByCategory.empty', { defaultValue: '—' })}
            action={<Pressable onPress={() => setManageCat(true)} hitSlop={8}><Settings2 size={15} strokeWidth={1.7} color={colors.textSub} /></Pressable>}
          />

          {/* Skipped toggle */}
          {skippedCount > 0 ? (
            <GlassPressable radius={999} on={showSkipped} style={styles.skipToggle} onPress={() => setShowSkipped((v) => !v)}>
              <Text style={[styles.skipToggleText, showSkipped && styles.skipToggleTextOn]}>
                {showSkipped ? i18n.t('finance:hideSkipped', { defaultValue: 'הסתר דילוגים' }) : i18n.t('finance:showSkipped', { count: skippedCount, defaultValue: `הצג דילוגים (${skippedCount})` })}
              </Text>
            </GlassPressable>
          ) : null}

          {/* Transactions */}
          {listTx.length ? (
            <Card padded={false}>{listTx.map((t, i) => renderRow(t, i))}</Card>
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
      <FinanceCategoriesModal open={manageCat} categories={categories} onClose={() => setManageCat(false)} onAdd={addCategory} onRemove={removeCategory} />
      <RecurringModal open={addRec} onClose={() => setAddRec(false)} onSave={addRecurring} />
      <RecurringModal open={!!editRec} template={editRec} onClose={() => setEditRec(null)} onSave={(patch) => updateRecurring(editRec.id, patch)} />
    </Screen>
  )
}

function Breakdown({ Icon, title, rows, empty, action }) {
  return (
    <Card contentStyle={styles.bd}>
      <View style={styles.bdHead}>
        <Icon size={15} strokeWidth={1.6} color={colors.textSub} />
        <Text style={styles.bdTitle}>{title}</Text>
        {rows.length ? <Text style={styles.bdCount}>{rows.length}</Text> : null}
        <View style={{ flex: 1 }} />
        {action}
      </View>
      {rows.length ? rows.map((r) => (
        <View key={r.id} style={styles.bdRow}>
          <View style={styles.bdRowHead}>
            <View style={[styles.bdDot, { backgroundColor: r.color }]} />
            <Text style={styles.bdName} numberOfLines={1}>{r.name}</Text>
            <Text style={styles.bdAmt}>{isr(r.sum)}</Text>
          </View>
          <View style={styles.bdBar}><View style={[styles.bdFill, { width: `${r.pct}%`, backgroundColor: r.color }]} /></View>
        </View>
      )) : <Text style={styles.bdEmpty}>{empty}</Text>}
    </Card>
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

  // Breakdown card
  bd: { paddingVertical: 16, paddingHorizontal: 18, gap: 12 },
  bdHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bdTitle: { fontSize: 13, fontWeight: '600', color: colors.text },
  bdCount: { fontSize: 11, fontWeight: '500', color: colors.textSub, backgroundColor: 'rgba(42,37,32,0.06)', borderRadius: 10, paddingVertical: 1, paddingHorizontal: 8, overflow: 'hidden' },
  bdEmpty: { fontSize: 12, color: colors.textFaint },
  bdRow: { gap: 6 },
  bdRowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bdDot: { width: 9, height: 9, borderRadius: 5 },
  bdName: { flex: 1, fontSize: 13, color: colors.text },
  bdAmt: { fontSize: 13, fontWeight: '600', color: colors.text },
  bdBar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(42,37,32,0.06)', overflow: 'hidden' },
  bdFill: { height: 6, borderRadius: 3 },

  // Recurring
  rec: { paddingVertical: 14, paddingHorizontal: 16, gap: 4 },
  recHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  recTitle: { fontSize: 13, fontWeight: '600', color: colors.text },
  recAdd: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  recAddText: { fontSize: 12, fontWeight: '500', color: colors.brand },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  recPaused: { opacity: 0.55 },
  recMain: { flex: 1, gap: 2 },
  recDesc: { fontSize: 14, color: colors.text },
  recMeta: { fontSize: 11, color: colors.textFaint },
  recAmt: { fontSize: 14, fontWeight: '600' },
  recActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  // Skipped toggle
  skipToggle: { alignSelf: 'center', paddingVertical: 7, paddingHorizontal: 16 },
  skipToggleText: { fontSize: 12, color: colors.textSub },
  skipToggleTextOn: { color: colors.onBrand, fontWeight: '600' },

  // Rows
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  info: { flex: 1, gap: 2 },
  desc: { fontSize: 15, color: colors.text },
  skippedText: { color: colors.textFaint, textDecorationLine: 'line-through' },
  date: { fontSize: 12, color: colors.textFaint },
  amount: { fontSize: 15, fontWeight: '600' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  approve: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(139,168,136,0.4)', alignItems: 'center', justifyContent: 'center' },
  skip: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
})

Breakdown.displayName = 'Breakdown'
