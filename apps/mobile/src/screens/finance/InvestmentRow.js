import { useMemo, useRef, useState } from 'react'
import { View, Alert } from 'react-native'
import Slider from '@react-native-community/slider'
import { ChevronDown, ChevronUp, Sprout, Check, Bell, BellRing, Info, X } from 'lucide-react-native'
import { isr, fmtMonthYear, fmtShortDate, computeInvestment, migrateInvestmentSettings, normalizePercent, INVESTMENT_BASES, INVESTMENT_VIEWS } from '@simplicity/core'
import { Text, TextInput } from '../../components/Text'
import { Pressable } from '../../components/Pressable'
import Card from '../../components/Card'
import AddReminderModal from '../../modals/AddReminderModal'
import RecordInvestmentModal from '../../modals/RecordInvestmentModal'
import { useInvestments } from '../../hooks/useInvestments'
import { usePreferences } from '../../hooks/usePreferences'
import { localDateString } from '../../lib/investments'
import i18n from '../../lib/i18n'
import { colors } from '../../theme/theme'
import { themed } from '../../theme/themed'

const t = (k, o) => i18n.t(`finance:investment.${k}`, o)
const CANCEL = () => i18n.t('modalsData:common.cancel', { defaultValue: 'ביטול' })

/* ════════════════════════════════════════════════════════════════
   InvestmentRow — "כמה מההכנסה להפריש להשקעות" (web InvestmentRow).
   ════════════════════════════════════════════════════════════════
   One line at rest: the answer ("set aside ₪1,000") for the month on
   screen, labelled with the month it was actually drawn from. Tapping it
   opens the settings — income or net, the percentage (slider, or tap the
   number to type an exact one) — and the record: what was really
   invested, monthly or cumulative, "השקעתי ₪X", a reminder, and the rows
   behind the total, each removable (taking its expense with it).

   The figure comes from core computeInvestment, the same function the web
   row uses, so the two apps can't quote different targets. The phone had
   none of this before.
   ════════════════════════════════════════════════════════════════ */
export default function InvestmentRow({ month, transactions, loading, categories, addCategory, addTransaction, deleteTransaction, restoreTransaction }) {
  const { prefs, update } = usePreferences()
  const settings = useMemo(() => migrateInvestmentSettings(prefs?.investment), [prefs?.investment])
  const write = (patch) => update({ investment: migrateInvestmentSettings({ ...settings, ...patch }) })
  const { investments, reminders, recordInvestment, undoInvestment, addReminder } = useInvestments({
    transactions, transactionsLoading: loading, categories, addCategory, addTransaction, deleteTransaction, restoreTransaction,
  })

  const [open, setOpen] = useState(false)
  const [sliding, setSliding] = useState(null)
  const [draft, setDraft] = useState(null)
  const [histOpen, setHistOpen] = useState(false)
  const [remindOpen, setRemindOpen] = useState(false)
  const [recordOpen, setRecordOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const investingRef = useRef(false)

  const monthKey = month ? month.getTime() : null
  const calc = useMemo(
    () => computeInvestment(transactions, settings, new Date(), investments, month),
    [transactions, settings, investments, monthKey], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const { baseAmount, targetAmount, investedAmount, baseWasNegative, hasData, basisFellBack, basisMonth, selectedMonth, isCurrentMonth, investedRows } = calc

  const shownPct = sliding ?? settings.percent
  // Tracks the thumb mid-drag; identical to targetAmount otherwise.
  const liveTarget = sliding == null ? targetAmount : (baseWasNegative ? 0 : (shownPct / 100) * baseAmount)
  const basisLabel = fmtMonthYear(basisMonth)
  const selectedLabel = fmtMonthYear(selectedMonth)
  const activeReminder = reminders[0] || null

  // Await the save before releasing the local value, or the row flashes the old percentage.
  const commitSlide = async (v) => {
    await write({ percent: normalizePercent(v) })
    setSliding(null)
  }
  const commitDraft = async () => {
    if (draft != null) await write({ percent: normalizePercent(draft) })
    setDraft(null)
  }

  const doRecord = async (investedOn = null) => {
    // A ref, not state: a fast double tap must not record the money twice.
    if (investingRef.current || liveTarget <= 0) return
    investingRef.current = true
    setSaving(true)
    try { await recordInvestment({ amount: liveTarget, investedOn }) } finally { investingRef.current = false; setSaving(false) }
  }
  const onInvest = () => {
    if (!isCurrentMonth) { setRecordOpen(true); return }
    doRecord().catch(() => {}) // the hook raised its own toast
  }

  const confirmDelete = (r) => Alert.alert(
    t('deleteTitle'),
    t('deleteMessage', { amount: isr(Number(r.amount) || 0), date: r.invested_on ? fmtShortDate(r.invested_on) : '—' }),
    [{ text: CANCEL(), style: 'cancel' }, { text: t('deleteConfirm'), style: 'destructive', onPress: () => undoInvestment(r.id) }],
  )

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  return (
    <Card padded={false}>
      <Pressable style={styles.head} onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Sprout size={15} strokeWidth={1.8} color={colors.positive} />
        <Text style={styles.title}>{t('title')}</Text>
        {activeReminder ? <BellRing size={13} strokeWidth={1.8} color={colors.brand} accessibilityLabel={t('reminderSetOn', { date: fmtShortDate(activeReminder.scheduled_at) })} /> : null}
        {basisFellBack ? <Info size={13} strokeWidth={1.8} color={colors.amberWarn} accessibilityLabel={t('staleBasis', { selected: selectedLabel, month: basisLabel })} /> : null}
        <View style={{ flex: 1 }} />
        <Text style={styles.month}>{basisLabel}</Text>
        <Text style={styles.amount}>{isr(liveTarget)}</Text>
        {open ? <ChevronUp size={15} strokeWidth={1.8} color={colors.textSub} /> : <ChevronDown size={15} strokeWidth={1.8} color={colors.textSub} />}
      </Pressable>

      {open ? (
        <View style={styles.body}>
          <View style={styles.field}>
            <Text style={styles.label}>{t('baseLabel')}</Text>
            <Toggle label={t('settingsAria')} value={settings.base} options={INVESTMENT_BASES.map((b) => [b, t(b === 'income' ? 'baseIncome' : 'baseNet')])} onChange={(base) => write({ base })} />
          </View>

          <View style={styles.field}>
            <View style={styles.pctHead}>
              <Text style={styles.label}>{t('percentLabel')}</Text>
              {draft != null ? (
                <TextInput
                  style={styles.pctInput}
                  value={draft}
                  onChangeText={setDraft}
                  onBlur={commitDraft}
                  onSubmitEditing={commitDraft}
                  keyboardType="decimal-pad"
                  autoFocus
                  selectTextOnFocus
                  accessibilityLabel={t('percentAria')}
                />
              ) : (
                <Pressable onPress={() => setDraft(String(shownPct))} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('percentAria')}>
                  <Text style={styles.pctVal}>{shownPct}%</Text>
                </Pressable>
              )}
            </View>
            <Slider
              minimumValue={0}
              maximumValue={100}
              step={1}
              value={settings.percent}
              onValueChange={setSliding}
              onSlidingComplete={commitSlide}
              minimumTrackTintColor={colors.brand}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.brand}
              accessibilityLabel={t('percentAria')}
            />
            <Text style={styles.hint}>{t('basedOn', { month: basisLabel })}</Text>
          </View>

          {baseWasNegative ? <Text style={styles.note}>{t('negativeBase', { month: basisLabel })}</Text> : null}
          {!hasData && !baseWasNegative ? <Text style={styles.note}>{t('noData', { month: selectedLabel })}</Text> : null}
          {basisFellBack ? <Text style={[styles.note, styles.warn]}>{t('staleBasis', { selected: selectedLabel, month: basisLabel })}</Text> : null}

          <View style={styles.divider} />

          <View style={styles.field}>
            <Text style={styles.label}>
              {settings.view === 'cumulative' ? t('investedCumulative') : (isCurrentMonth ? t('investedMonthly') : t('investedInMonth', { month: selectedLabel }))}
            </Text>
            <Toggle label={t('viewAria')} value={settings.view} options={INVESTMENT_VIEWS.map((v) => [v, t(v === 'monthly' ? 'viewMonthly' : 'viewCumulative')])} onChange={(view) => write({ view })} />
          </View>

          <Text style={styles.invested}>{isr(investedAmount)}</Text>
          <View style={styles.actions}>
            <Pressable style={[styles.remind, activeReminder && styles.remindOn]} onPress={() => setRemindOpen(true)} accessibilityRole="button">
              {activeReminder ? <BellRing size={14} strokeWidth={1.8} color={colors.brand} /> : <Bell size={14} strokeWidth={1.8} color={colors.textSub} />}
              <Text style={[styles.remindText, activeReminder && styles.remindTextOn]} numberOfLines={1}>
                {activeReminder ? t('reminderSetOn', { date: fmtShortDate(activeReminder.scheduled_at) }) : t('remindMe')}
              </Text>
            </Pressable>
            <Pressable style={[styles.cta, (saving || liveTarget <= 0) && styles.off]} onPress={onInvest} disabled={saving || liveTarget <= 0} accessibilityRole="button">
              <Check size={14} strokeWidth={2} color={colors.onBtn} />
              <Text style={styles.ctaText}>{t('didInvest')} {isr(liveTarget)}</Text>
            </Pressable>
          </View>

          {(investedRows || []).length ? (
            <View style={styles.hist}>
              <Pressable style={styles.histToggle} onPress={() => setHistOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: histOpen }}>
                <Text style={styles.label}>{t('historyTitle')}</Text>
                <Text style={styles.count}>{investedRows.length}</Text>
                {histOpen ? <ChevronUp size={14} strokeWidth={1.7} color={colors.textSub} /> : <ChevronDown size={14} strokeWidth={1.7} color={colors.textSub} />}
              </Pressable>
              {histOpen ? investedRows.map((r) => (
                <View key={r.id} style={styles.histRow}>
                  <Text style={styles.histDate}>{r.invested_on ? fmtShortDate(r.invested_on) : '—'}</Text>
                  <Text style={styles.histAmt}>{isr(Number(r.amount) || 0)}</Text>
                  <Pressable onPress={() => confirmDelete(r)} hitSlop={8} accessibilityLabel={t('deleteAria')}>
                    <X size={14} strokeWidth={1.8} color={colors.textSub} />
                  </Pressable>
                </View>
              )) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* The app's reminder sheet, bound to the investment and pre-worded with the
          percentage (true even if made recurring) and the current figure. */}
      <AddReminderModal
        open={remindOpen}
        onClose={() => setRemindOpen(false)}
        onSave={addReminder}
        linkedTo={{ type: 'investment', id: null }}
        linkedSubjectName={t('title')}
        prefill={{
          title: t('reminderTitle', { percent: shownPct }),
          description: t('reminderBody', { amount: isr(liveTarget), month: basisLabel }),
          date: localDateString(tomorrow),
          time: '09:00',
        }}
      />
      <RecordInvestmentModal open={recordOpen} onClose={() => setRecordOpen(false)} onConfirm={doRecord} amount={liveTarget} month={selectedMonth} />
    </Card>
  )
}

/* Two-option segmented control (web .mg-toggle). */
function Toggle({ value, options, onChange, label }) {
  return (
    <View style={styles.toggle} accessibilityLabel={label}>
      {options.map(([k, text]) => {
        const on = value === k
        return (
          <Pressable key={k} style={[styles.toggleBtn, on && styles.toggleOn]} onPress={() => onChange(k)} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{text}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = themed((c) => ({
  head: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16 },
  title: { fontSize: 14, fontWeight: '600', color: c.text },
  month: { fontSize: 12, color: c.textSub },
  amount: { fontSize: 15, fontWeight: '600', color: c.text, fontVariant: ['tabular-nums'] },
  body: { gap: 12, paddingHorizontal: 16, paddingBottom: 16 },
  field: { gap: 8 },
  label: { fontSize: 13, color: c.textSub },
  hint: { fontSize: 12, color: c.textFaint },
  note: { fontSize: 12, color: c.textSub, lineHeight: 17 },
  warn: { color: c.amberWarn },
  toggle: { flexDirection: 'row', gap: 6, padding: 3, borderRadius: 999, backgroundColor: c.fill, alignSelf: 'flex-start' },
  toggleBtn: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999 },
  toggleOn: { backgroundColor: c.card },
  toggleText: { fontSize: 13, color: c.textSub },
  toggleTextOn: { color: c.text, fontWeight: '600' },
  pctHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pctVal: { fontSize: 16, fontWeight: '600', color: c.brand, fontVariant: ['tabular-nums'] },
  pctInput: { minWidth: 72, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, fontSize: 15, color: c.text, backgroundColor: c.card, textAlign: 'center' },
  divider: { height: 1, backgroundColor: c.divider },
  invested: { fontSize: 22, fontWeight: '600', color: c.text, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  remind: { minHeight: 44, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border },
  remindOn: { borderColor: c.brand },
  remindText: { flexShrink: 1, fontSize: 13, color: c.textSub },
  remindTextOn: { color: c.brand },
  cta: { minHeight: 44, flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 12, backgroundColor: c.btnBg },
  ctaText: { fontSize: 14, fontWeight: '600', color: c.onBtn },
  off: { opacity: 0.5 },
  hist: { gap: 4 },
  histToggle: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8 },
  count: { fontSize: 11, fontWeight: '500', color: c.textSub, backgroundColor: c.fillStrong, borderRadius: 10, paddingHorizontal: 8, overflow: 'hidden' },
  histRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: c.divider },
  histDate: { flex: 1, fontSize: 13, color: c.textSub },
  histAmt: { fontSize: 14, color: c.text, fontVariant: ['tabular-nums'] },
}))
