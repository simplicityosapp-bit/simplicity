import { View, Text, Pressable, StyleSheet, Linking } from 'react-native'
import { Clock, Check, CalendarDays, ArrowLeftRight, MessageCircle, X } from 'lucide-react-native'
import { statusMetaOfLead, fmtShortDate } from '@simplicity/core'
import { GlassPressable } from '../../components/Glass'
import i18n from '../../lib/i18n'
import { colors } from '../../theme/theme'

const T = (k, o) => i18n.t(`leads:card.${k}`, o)
const todayYmd = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// A single lead card (mirrors web LeadCard): name + sub-status + source +
// inquiry/follow-up dates + a footer (converted badge / convert · move ·
// WhatsApp). Tap opens edit; the × deletes. `dragHandlers` (Stage: drag) spread
// the PanResponder onto the card; `dragging` dims the lifted card.
export default function LeadCard({ lead, onEdit, onConvert, onDelete, onMove, sources = [], statuses = [], dragHandlers = null, dragging = false }) {
  const meta = statusMetaOfLead(lead)
  const source = lead.source_id ? sources.find((s) => s.id === lead.source_id) : null
  const sub = lead.status_id ? statuses.find((s) => s.id === lead.status_id) : null
  const overdue = lead.follow_up_date && String(lead.follow_up_date).slice(0, 10) <= todayYmd() && meta === 'in_process'
  const isConverted = meta === 'converted' && lead.converted_to_client_id
  const whatsapp = () => {
    const p = (lead.phone || '').replace(/\D/g, '')
    Linking.openURL(`https://wa.me/${p}`)
  }

  return (
    <GlassPressable radius={20} style={[styles.card, dragging && styles.dragging]} onPress={() => onEdit?.(lead)} {...(dragHandlers || {})}>
      {onDelete ? (
        <Pressable style={styles.del} onPress={() => onDelete(lead)} hitSlop={8}>
          <X size={12} strokeWidth={2} color={colors.textFaint} />
        </Pressable>
      ) : null}

      <Text style={styles.name} numberOfLines={1}>{lead.name || '—'}</Text>

      {sub ? (
        <View style={styles.sub}>
          <View style={[styles.subDot, { backgroundColor: sub.color || colors.textSub }]} />
          <Text style={styles.subText} numberOfLines={1}>{sub.display_name}</Text>
        </View>
      ) : null}

      <View style={styles.src}>
        <View style={[styles.srcDot, { backgroundColor: source?.color || 'rgba(42,37,32,0.2)' }]} />
        <Text style={[styles.srcText, !source && styles.srcNone]} numberOfLines={1}>{source ? source.name : T('noSource')}</Text>
      </View>

      {lead.inquiry_date ? (
        <View style={styles.line}>
          <CalendarDays size={11} strokeWidth={1.6} color={colors.textFaint} />
          <Text style={styles.lineText}>{T('inquiry', { date: fmtShortDate(lead.inquiry_date) })}</Text>
        </View>
      ) : null}
      {lead.follow_up_date ? (
        <View style={styles.line}>
          <Clock size={11} strokeWidth={1.6} color={overdue ? colors.danger : colors.textSub} />
          <Text style={[styles.fuText, overdue && styles.overdue]}>{fmtShortDate(lead.follow_up_date)}</Text>
        </View>
      ) : null}

      <View style={styles.foot}>
        {isConverted ? (
          <View style={styles.converted}><Check size={11} strokeWidth={2} color={colors.positive} /><Text style={styles.convertedText}>{T('converted')}</Text></View>
        ) : onConvert ? (
          <Pressable style={styles.convertBtn} onPress={() => onConvert(lead)} hitSlop={6}>
            <Text style={styles.convertText}>{T('convert')}</Text>
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }} />
        {onMove ? (
          <Pressable style={styles.iconBtn} onPress={() => onMove(lead)} hitSlop={6}>
            <ArrowLeftRight size={14} strokeWidth={1.7} color={colors.textSub} />
          </Pressable>
        ) : null}
        <Pressable style={styles.iconBtn} onPress={whatsapp} hitSlop={6}>
          <MessageCircle size={14} strokeWidth={1.7} color={colors.positive} />
        </Pressable>
      </View>
    </GlassPressable>
  )
}

const styles = StyleSheet.create({
  card: { padding: 12, gap: 8 },
  dragging: { opacity: 0.4 },
  del: { position: 'absolute', top: 6, insetInlineEnd: 6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  name: { fontSize: 14, fontWeight: '600', color: colors.text, paddingInlineEnd: 18 },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, backgroundColor: colors.fill },
  subDot: { width: 7, height: 7, borderRadius: 4 },
  subText: { fontSize: 12, color: colors.textSub },
  src: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  srcDot: { width: 7, height: 7, borderRadius: 4 },
  srcText: { fontSize: 12, color: colors.textSub },
  srcNone: { color: colors.textFaint },
  line: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  lineText: { fontSize: 11, color: colors.textFaint },
  fuText: { fontSize: 11, color: colors.textSub }, // web .lead-fu = var(--stone)
  overdue: { color: colors.danger, fontWeight: '500' },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  converted: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  convertedText: { fontSize: 11, fontWeight: '600', color: colors.positive },
  convertBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(139,168,136,0.4)', backgroundColor: 'rgba(139,168,136,0.10)' },
  convertText: { fontSize: 11, fontWeight: '500', color: colors.text },
  iconBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardFlat },
})
