import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Bell, Wallet, Calendar, Target, AlertCircle, Clock, ChevronLeft, MessageCircle } from 'lucide-react-native'
import { attentionItems } from '@simplicity/core'
import i18n from '../../lib/i18n'
import WidgetCard from '../../components/WidgetCard'
import Sheet from '../../components/Sheet'
import { colors } from '../../theme/theme'

// "דרושה תשומת לב" — action items derived by shared core attentionItems, in a
// collapsible card (Bell). Each row carries an `icon` name (mapped to lucide,
// amber) + text + `target` → a navigator screen. A `kind: 'people'` row (stale
// clients / leads / due follow-ups) opens an inline contact sheet instead — a
// list of people with a WhatsApp reach-out per person (mirrors web's people
// popup), so the user can act without leaving Home.
const ROW_ICON = { Wallet, Calendar, Target, AlertCircle, Clock, Bell }
const TARGET_SCREEN = {
  finance: 'Finance', calendar: 'Calendar', clients: 'Clients',
  goals: 'Goals', tasks: 'Tasks', leads: 'Leads',
}
const waOpen = (phone) => {
  const p = (phone || '').replace(/\D/g, '')
  Linking.openURL(`https://wa.me/${p}`)
}

export default function AttentionWidget({ data }) {
  const nav = useNavigation()
  const [peopleRow, setPeopleRow] = useState(null)
  const items = useMemo(() => attentionItems(new Date(), data), [data])
  if (!items.length) return null

  const summary = items[0].text + (items.length > 1 ? ` · ${i18n.t('home:widgets.attention.more', { count: items.length - 1 })}` : '')

  const onRow = (it) => {
    if (it.kind === 'people') { setPeopleRow(it); return }
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
          <Text style={styles.empty}>{i18n.t('home:widgets.attention.noPeople', { defaultValue: '—' })}</Text>
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
})
