import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Bell, Wallet, Calendar, Target, AlertCircle, Clock, ChevronLeft, MessageCircle, Check, SkipForward, Trash2 } from 'lucide-react-native'
import { attentionItems, isr, fmtShortDate } from '@simplicity/core'
import i18n from '../../lib/i18n'
import WidgetCard from '../../components/WidgetCard'
import Sheet from '../../components/Sheet'
import { colors } from '../../theme/theme'

// "דרושה תשומת לב" — action items derived by shared core attentionItems, in a
// collapsible card (Bell). Each row carries an `icon` name (mapped to lucide,
// amber) + text + `target` → a navigator screen. Two actionable kinds open an
// inline popup instead of navigating (mirrors web): a `kind: 'people'` row
// (stale clients / leads / due follow-ups) opens a contact sheet with a
// WhatsApp reach-out per person; a `kind: 'pendingTx'` row opens an
// approve / skip / delete list (+ bulk approve-all) so the user can clear
// pending transactions without leaving Home.
const ROW_ICON = { Wallet, Calendar, Target, AlertCircle, Clock, Bell }
const TARGET_SCREEN = {
  finance: 'Finance', calendar: 'Calendar', clients: 'Clients',
  goals: 'Goals', tasks: 'Tasks', leads: 'Leads',
}
const waOpen = (phone) => {
  const p = (phone || '').replace(/\D/g, '')
  Linking.openURL(`https://wa.me/${p}`)
}

export default function AttentionWidget({ data, projects = [], financeCategories = [], onApproveTx, onSkipTx, onDeleteTx }) {
  const nav = useNavigation()
  const [peopleRow, setPeopleRow] = useState(null)
  const [txOpen, setTxOpen] = useState(false)
  const items = useMemo(() => attentionItems(new Date(), data), [data])
  const pendingTxs = useMemo(
    () => (data?.transactions || []).filter((t) => !t.deleted_at && t.status === 'pending'),
    [data?.transactions],
  )
  const clients = data?.clients || []
  if (!items.length) return null

  const summary = items[0].text + (items.length > 1 ? ` · ${i18n.t('home:widgets.attention.more', { count: items.length - 1 })}` : '')

  const approveAllTx = async () => {
    for (const t of pendingTxs) await Promise.resolve(onApproveTx?.(t.id)).catch(() => {})
  }

  const onRow = (it) => {
    if (it.kind === 'people') { setPeopleRow(it); return }
    if (it.kind === 'pendingTx') { setTxOpen(true); return }
    const screen = TARGET_SCREEN[it.target]
    if (screen) nav.navigate(screen)
  }
  // Tap a person's name → open their client drawer (deep-link param) or the
  // leads board (leads have no per-row drawer on mobile). Mirrors web.
  const openPerson = (p) => {
    if (!peopleRow) return
    if (peopleRow.entity === 'client') nav.navigate('Clients', { openClientId: p.id })
    else nav.navigate('Leads')
    setPeopleRow(null)
  }

  return (
    <>
      <WidgetCard Icon={Bell} title={i18n.t('home:widgets.attention.title')} count={i18n.t('home:widgets.attention.count', { count: items.length })} summary={summary}>
        {items.map((it, i) => {
          const RowIcon = ROW_ICON[it.icon] || Bell
          return (
            <Pressable
              key={`${it.target}-${it.kind || ''}-${i}`}
              style={[styles.row, i > 0 && styles.rowBorder]}
              onPress={() => onRow(it)}
            >
              <RowIcon size={17} strokeWidth={1.7} color={colors.amberWarn} />
              <Text style={styles.text} numberOfLines={2}>{it.text}</Text>
              {it.kind === 'people'
                ? <MessageCircle size={16} strokeWidth={1.7} color={colors.positive} />
                : <ChevronLeft size={18} strokeWidth={1.6} color={colors.textFaint} />}
            </Pressable>
          )
        })}
      </WidgetCard>

      <Sheet open={!!peopleRow} onClose={() => setPeopleRow(null)} title={peopleRow?.text || i18n.t('home:widgets.attention.reachOut', { defaultValue: 'יצירת קשר' })}>
        {(peopleRow?.people || []).length === 0 ? (
          <Text style={styles.empty}>{i18n.t('home:widgets.attention.noPeople', { defaultValue: 'אין אנשים כרגע' })}</Text>
        ) : (peopleRow?.people || []).map((p, i) => (
          <View key={p.id || i} style={[styles.personRow, i > 0 && styles.rowBorder]}>
            <Pressable style={styles.personMain} onPress={() => openPerson(p)}>
              <Text style={styles.personName} numberOfLines={1}>{p.name || '—'}</Text>
            </Pressable>
            <Pressable style={styles.waBtn} onPress={() => waOpen(p.phone)} hitSlop={6} accessibilityLabel="WhatsApp">
              <MessageCircle size={17} strokeWidth={1.8} color={colors.positive} />
            </Pressable>
          </View>
        ))}
      </Sheet>

      <Sheet open={txOpen} onClose={() => setTxOpen(false)} title={i18n.t('home:widgets.attention.txModalTitle', { defaultValue: 'תנועות ממתינות' })}>
        {pendingTxs.length === 0 ? (
          <Text style={styles.empty}>{i18n.t('home:widgets.attention.txEmpty', { defaultValue: 'הכול מאושר' })}</Text>
        ) : (
          <>
            {pendingTxs.length > 1 ? (
              <Pressable style={styles.bulkBtn} onPress={approveAllTx} hitSlop={6}>
                <Check size={13} strokeWidth={1.9} color={colors.positive} />
                <Text style={styles.bulkText}>{i18n.t('finance:pending.approveAll', { defaultValue: 'אשר הכל' })}</Text>
              </Pressable>
            ) : null}
            {pendingTxs.map((t, i) => {
              const client = t.client_id ? clients.find((c) => c.id === t.client_id) : null
              const project = t.project_id ? projects.find((p) => p.id === t.project_id) : null
              const cat = t.category_id ? financeCategories.find((c) => c.id === t.category_id) : null
              const meta = [client?.name, project?.name, cat?.name].filter(Boolean).join(' · ')
              const income = t.type === 'income'
              return (
                <View key={t.id || i} style={[styles.txRow, i > 0 && styles.rowBorder]}>
                  <View style={styles.txMain}>
                    <Text style={styles.txDesc} numberOfLines={1}>{t.desc || i18n.t('finance:pending.noDesc', { defaultValue: '—' })}</Text>
                    <Text style={styles.txMeta} numberOfLines={1}>{fmtShortDate(t.date)}{meta ? ` · ${meta}` : ''}</Text>
                  </View>
                  <Text style={[styles.txAmt, { color: income ? colors.positive : colors.textSub }]}>{income ? '+' : '−'}{isr(t.amount)}</Text>
                  <View style={styles.txActions}>
                    <Pressable style={styles.txBtn} onPress={() => onApproveTx?.(t.id)} hitSlop={6}><Check size={16} strokeWidth={2.2} color={colors.positive} /></Pressable>
                    <Pressable style={styles.txBtn} onPress={() => onSkipTx?.(t.id)} hitSlop={6}><SkipForward size={15} strokeWidth={1.8} color={colors.textFaint} /></Pressable>
                    <Pressable style={styles.txBtn} onPress={() => onDeleteTx?.(t.id)} hitSlop={6}><Trash2 size={15} strokeWidth={1.8} color={colors.danger} /></Pressable>
                  </View>
                </View>
              )
            })}
          </>
        )}
      </Sheet>
    </>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  text: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
  empty: { fontSize: 13, color: colors.textFaint, textAlign: 'center', paddingVertical: 12 },
  personRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
  personMain: { flex: 1 },
  personName: { fontSize: 15, color: colors.text },
  waBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardFlat },
  bulkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end', paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(139,168,136,0.4)', backgroundColor: 'rgba(139,168,136,0.10)', marginBottom: 6 },
  bulkText: { fontSize: 13, fontWeight: '500', color: colors.positive },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  txMain: { flex: 1, minWidth: 0 },
  txDesc: { fontSize: 14, color: colors.text },
  txMeta: { fontSize: 12, color: colors.textSub, marginTop: 2 },
  txAmt: { fontSize: 14, fontVariant: ['tabular-nums'] },
  txActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  txBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardFlat },
})
