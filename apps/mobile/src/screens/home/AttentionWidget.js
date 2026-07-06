import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Bell, Wallet, Calendar, Target, AlertCircle, Clock, ChevronLeft } from 'lucide-react-native'
import { attentionItems } from '@simplicity/core'
import i18n from '../../lib/i18n'
import WidgetCard from '../../components/WidgetCard'
import { colors } from '../../theme/theme'

// "דרושה תשומת לב" — action items derived by shared core attentionItems, in a
// collapsible card (Bell). Each row carries an `icon` name (mapped to lucide,
// amber) + text + `target` → a navigator screen.
const ROW_ICON = { Wallet, Calendar, Target, AlertCircle, Clock, Bell }
const TARGET_SCREEN = {
  finance: 'Finance', calendar: 'Calendar', clients: 'Clients',
  goals: 'Goals', tasks: 'Tasks', leads: 'Leads',
}

export default function AttentionWidget({ data }) {
  const nav = useNavigation()
  const items = useMemo(() => attentionItems(new Date(), data), [data])
  if (!items.length) return null

  const summary = items[0].text + (items.length > 1 ? ` · ${i18n.t('home:widgets.attention.more', { count: items.length - 1 })}` : '')

  return (
    <WidgetCard Icon={Bell} title={i18n.t('home:widgets.attention.title')} count={i18n.t('home:widgets.attention.count', { count: items.length })} summary={summary}>
      {items.map((it, i) => {
        const RowIcon = ROW_ICON[it.icon] || Bell
        return (
          <Pressable
            key={`${it.target}-${it.kind || ''}-${i}`}
            style={[styles.row, i > 0 && styles.rowBorder]}
            onPress={() => {
              const screen = TARGET_SCREEN[it.target]
              if (screen) nav.navigate(screen)
            }}
          >
            <RowIcon size={17} strokeWidth={1.7} color={colors.amberWarn} />
            <Text style={styles.text} numberOfLines={2}>{it.text}</Text>
            <ChevronLeft size={18} strokeWidth={1.6} color={colors.textFaint} />
          </Pressable>
        )
      })}
    </WidgetCard>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  text: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
})
