import { View, Text, TextInput } from 'react-native'
import { Users, BadgeCheck, Activity, MessageSquare, CalendarCheck, Target } from 'lucide-react-native'
import i18n from '../../lib/i18n'
import Card from '../../components/Card'
import { useAdminQuery } from '../../hooks/useAdmin'
import { usePreferences } from '../../hooks/usePreferences'
import { colors } from '../../theme/theme'
import { themed } from '../../theme/themed'
import { AdminState, SectionHead } from './AdminBits'
import { BarChart } from './AdminCharts'

const T = (k, o) => i18n.t(`admin:${k}`, o)

const STAT_CARDS = [
  { key: 'totalUsers', Icon: Users },
  { key: 'subscribers', Icon: BadgeCheck, sub: 'subscribersSub' },
  { key: 'active7d', Icon: Activity },
  { key: 'openFeedback', Icon: MessageSquare },
  { key: 'sessionsThisWeek', Icon: CalendarCheck },
]

/* The targets the owner can set. Each auto-fills its "current" from a live
   dashboard counter, so a target is just a number to aim at. */
const TARGETS = ['totalUsers', 'active7d', 'sessionsThisWeek']

/* Weekly x-label: dd/mm of the week's start. */
function weekLabel(d) {
  const [, m, day] = (d.weekStart || '').split('-')
  return day && m ? `${day}/${m}` : ''
}

export default function AdminDashboard() {
  const { data, loading, error } = useAdminQuery('dashboard')
  const { prefs, update } = usePreferences()
  const targets = prefs?.adminTargets || {}

  const setTarget = (key, raw) => {
    const n = raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0)
    update({ adminTargets: { ...targets, [key]: n } })
  }

  return (
    <>
      <AdminState loading={loading} error={error} hasData={!!data} />

      {data ? (
        <>
          <View style={styles.stats}>
            {STAT_CARDS.map(({ key, Icon, sub }) => (
              <Card key={key} style={styles.stat}>
                <View style={styles.statLabel}>
                  <Icon size={14} strokeWidth={1.8} color={colors.textSub} />
                  <Text style={styles.statLabelText} numberOfLines={1}>{T(`dashboard.stats.${key}`)}</Text>
                </View>
                <Text style={styles.statValue}>{(data.totals?.[key] ?? 0).toLocaleString('he-IL')}</Text>
                {sub ? <Text style={styles.statSub}>{T(`dashboard.stats.${sub}`)}</Text> : null}
              </Card>
            ))}
          </View>

          <SectionHead title={T('dashboard.signupsOverTime')} />
          <Card style={styles.chartCard}>
            <BarChart data={data.signups || []} formatX={weekLabel} />
          </Card>

          <SectionHead title={T('dashboard.goalsHeading')} Icon={Target} />
          <View style={styles.goals}>
            {TARGETS.map((key) => {
              const now = data.totals?.[key] ?? 0
              const target = targets[key]
              const pct = target ? Math.min(100, Math.round((now / target) * 100)) : 0
              const done = target && now >= target
              return (
                <Card key={key} style={styles.goal}>
                  <View style={styles.goalHead}>
                    <Text style={styles.goalLabel} numberOfLines={1}>{T(`dashboard.targets.${key}`)}</Text>
                    <View style={styles.goalNow}>
                      <Text style={styles.goalNowValue}>{now.toLocaleString('he-IL')}</Text>
                      <Text style={styles.goalSlash}> / </Text>
                      <TextInput
                        style={styles.goalInput}
                        value={target == null ? '' : String(target)}
                        placeholder={T('dashboard.targetPlaceholder')}
                        placeholderTextColor={colors.textFaint}
                        keyboardType="number-pad"
                        inputMode="numeric"
                        onChangeText={(v) => setTarget(key, v)}
                      />
                    </View>
                  </View>
                  <View style={styles.goalBar}>
                    <View style={[styles.goalFill, { width: `${pct}%` }, done && styles.goalFillDone]} />
                  </View>
                </Card>
              )
            })}
          </View>
        </>
      ) : null}
    </>
  )
}

const styles = themed((c, t) => ({
  /* Two per row, wrapping — five cards means the last sits alone, which
     reads as a summary line rather than a gap. */
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexGrow: 1, flexBasis: '46%', gap: 4, paddingVertical: 12 },
  statLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statLabelText: { ...t.micro, color: c.textSub, flexShrink: 1 },
  statValue: { fontSize: 22, fontWeight: '600', color: c.text },
  statSub: { ...t.micro, color: c.textFaint },

  chartCard: { paddingVertical: 12, paddingHorizontal: 12 },

  goals: { gap: 10 },
  goal: { gap: 8 },
  goalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  goalLabel: { ...t.caption, color: c.textSub, flexShrink: 1 },
  goalNow: { flexDirection: 'row', alignItems: 'center' },
  goalNowValue: { ...t.body, color: c.text, fontWeight: '700' },
  goalSlash: { ...t.body, color: c.textFaint },
  goalInput: {
    minWidth: 54, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8,
    borderWidth: 1, borderColor: c.border, backgroundColor: c.inputBg,
    color: c.text, fontSize: 14, textAlign: 'center',
  },
  goalBar: { height: 7, borderRadius: 999, backgroundColor: c.fill, overflow: 'hidden' },
  goalFill: { height: 7, borderRadius: 999, backgroundColor: c.brand },
  goalFillDone: { backgroundColor: c.positive },
}))
