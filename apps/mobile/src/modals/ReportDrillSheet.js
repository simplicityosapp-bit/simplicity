import { useMemo } from 'react'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { BarChart3, Leaf, XCircle, ArrowRight, Users, Check, Calendar, ArrowDownCircle, ArrowUpCircle, CircleAlert, ChevronLeft } from 'lucide-react-native'
import { REPORT_METRICS, computeReportForRange, getDrillRecords } from '@simplicity/core'
import { Text } from '../components/Text'
import { Pressable } from '../components/Pressable'
import Sheet from '../components/Sheet'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'

const T = (k, o) => i18n.t(`reports:${k}`, o)
const ROW_ICONS = { leaf: Leaf, x: XCircle, arrow: ArrowRight, users: Users, user: Users, check: Check, calendar: Calendar, arrowDown: ArrowDownCircle, arrowUp: ArrowUpCircle, circleAlert: CircleAlert }

/* Core's drill records point at web paths. Where each one lives on the phone:
   a stack screen by name, a tab through 'Main', a client with its drawer open. */
export function drillTarget(path) {
  if (!path) return null
  const client = /^\/clients\/(.+)$/.exec(path)
  if (client) return { name: 'Main', params: { screen: 'Clients', params: { openClientId: client[1] } } }
  const map = {
    '/clients': { name: 'Main', params: { screen: 'Clients' } },
    '/finance': { name: 'Main', params: { screen: 'Finance' } },
    '/tasks': { name: 'Main', params: { screen: 'Tasks' } },
    '/leads': { name: 'Leads' },
    '/calendar': { name: 'Calendar' },
    '/trash': { name: 'Trash' },
  }
  return map[path] || null
}

/* ════════════════════════════════════════════════════════════════
   What's behind a report figure (web reports DrillModal).
   ════════════════════════════════════════════════════════════════
   The rows that make up one metric for one month, each opening where it
   lives. A count comes from the tally ledger and the list from the rows, so
   once the 30-day purge has removed an old month's rows the sheet says how
   many can no longer be shown rather than letting "47" sit over 12 rows.
   ════════════════════════════════════════════════════════════════ */
export default function ReportDrillSheet({ drill, data, onClose }) {
  const nav = useNavigation()
  const metric = drill ? REPORT_METRICS.find((m) => m.id === drill.metricId) : null
  const records = useMemo(
    () => (drill ? getDrillRecords(drill.metricId, drill.period.start, drill.period.end, data) : []),
    [drill, data],
  )
  const counted = useMemo(() => {
    if (!drill || !metric || metric.format !== 'count') return null
    const v = computeReportForRange(drill.period.start, drill.period.end, data).metrics[drill.metricId]
    return typeof v === 'number' ? v : null
  }, [drill, metric, data])
  const missing = counted !== null ? counted - records.length : 0
  const title = metric && drill ? `${T(`metrics.${metric.id}`)} · ${drill.period.label}` : T('drill.title')

  const open = (r) => {
    const target = drillTarget(r.navigateTo)
    onClose()
    if (target) nav.navigate(target.name, target.params)
  }

  return (
    <Sheet open={!!drill} onClose={onClose} title={title}>
      <Text style={styles.count}>{T('drill.count', { count: counted ?? records.length })}</Text>
      {missing > 0 ? <Text style={styles.purged}>{T('drill.purged', { count: missing })}</Text> : null}
      {records.length === 0 && missing <= 0 ? (
        <Text style={styles.empty}>{T('drill.empty')}</Text>
      ) : (
        <View style={styles.list}>
          {records.map((r, i) => {
            const Icon = ROW_ICONS[r.icon] || BarChart3
            return (
              <Pressable key={`${r.primary}-${i}`} style={[styles.row, i > 0 && styles.rowBorder]} onPress={() => open(r)} accessibilityRole="button">
                <Icon size={15} strokeWidth={1.6} color={colors.textSub} />
                <View style={styles.text}>
                  <Text style={styles.primary} numberOfLines={1}>{r.primary}</Text>
                  {r.secondary ? <Text style={styles.secondary} numberOfLines={2}>{r.secondary}</Text> : null}
                </View>
                <ChevronLeft size={16} strokeWidth={1.5} color={colors.textFaint} />
              </Pressable>
            )
          })}
        </View>
      )}
    </Sheet>
  )
}

const styles = themed((c) => ({
  count: { fontSize: 13, color: c.textSub },
  purged: { fontSize: 12, color: c.amberWarn, lineHeight: 17 },
  empty: { fontSize: 14, color: c.textFaint, textAlign: 'center', paddingVertical: 20 },
  list: { borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, overflow: 'hidden' },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: c.divider },
  text: { flex: 1, gap: 2 },
  primary: { fontSize: 14, color: c.text },
  secondary: { fontSize: 12, color: c.textSub },
}))
