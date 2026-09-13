import { useState } from 'react'
import { View, ScrollView } from 'react-native'
import { Text } from '../../components/Text'
import { Pressable } from '../../components/Pressable'
import i18n from '../../lib/i18n'
import Card from '../../components/Card'
import { useAdminQuery } from '../../hooks/useAdmin'
import { themed } from '../../theme/themed'
import { AdminState, SectionHead } from './AdminBits'
import { LineChart, FunnelBars } from './AdminCharts'

const T = (k, o) => i18n.t(`admin:${k}`, o)

/* The five windows the edge function knows (see its analytics action):
   today, the last 7 days, the last 30 days, the calendar month from the
   1st, and everything since the first row of data. Every card on this
   screen is read over the chosen window. 30 days is the default. */
const RANGES = ['today', 'week', 'days30', 'month', 'all']

/* "YYYY-MM-DD" → dd/mm for the x-axis. */
function dayLabel(d) {
  const [, m, day] = (d.date || '').split('-')
  return day && m ? `${day}/${m}` : ''
}

export default function AdminAnalytics() {
  const [range, setRange] = useState('days30')
  const { data, loading, error } = useAdminQuery('analytics', { range })

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ranges}>
        {RANGES.map((r) => (
          <Pressable
            key={r}
            style={[styles.range, range === r && styles.rangeOn]}
            onPress={() => setRange(r)}
            accessibilityRole="button"
            accessibilityState={{ selected: range === r }}
          >
            <Text style={[styles.rangeText, range === r && styles.rangeTextOn]}>{T(`analytics.ranges.${r}`)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <AdminState loading={loading} error={error} hasData={!!data} />

      {data ? (
        <>
          <SectionHead title={T('analytics.sessionsOverTime')} />
          <Card style={styles.chartCard}>
            <LineChart data={data.sessionsOverTime || []} formatX={dayLabel} gradId="admSessions" />
          </Card>

          <SectionHead title={T('analytics.reflectionsOverTime')} />
          <Card style={styles.chartCard}>
            <LineChart data={data.reflectionsOverTime || []} alt formatX={dayLabel} gradId="admReflections" />
          </Card>

          <SectionHead title={T('analytics.onboardingFunnel')} />
          <Card><FunnelBars data={data.funnel || []} /></Card>

          <SectionHead title={T('analytics.landingFunnel')} />
          <Card><FunnelBars data={data.landingFunnel || []} /></Card>

          <SectionHead title={T('analytics.landingEngagement')} />
          <Card><FunnelBars data={data.landingEngagement || []} /></Card>

          <SectionHead title={T('analytics.topUsers')} />
          <Card style={styles.topCard}>
            {(data.topUsers || []).length === 0 ? (
              <Text style={styles.empty}>{T('analytics.topUsersEmpty')}</Text>
            ) : (
              (data.topUsers || []).map((u, i) => (
                <View key={i} style={styles.topRow}>
                  <Text style={styles.topRank}>{i + 1}</Text>
                  <Text style={styles.topEmail} numberOfLines={1}>{u.email || '—'}</Text>
                  <Text style={styles.topCount}>{u.sessions}</Text>
                </View>
              ))
            )}
          </Card>
        </>
      ) : null}
    </>
  )
}

const styles = themed((c, t) => ({
  ranges: { gap: 6, paddingBottom: 4 },
  range: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: c.fill },
  rangeOn: { backgroundColor: c.brand },
  rangeText: { fontSize: 12, color: c.textSub, fontWeight: '500' },
  rangeTextOn: { color: c.onBrand, fontWeight: '600' },

  chartCard: { paddingVertical: 12, paddingHorizontal: 12 },

  topCard: { gap: 0 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.divider },
  topRank: { ...t.micro, color: c.textFaint, minWidth: 16 },
  /* Emails are Latin text in an RTL app — pin the direction or the
     punctuation drifts to the wrong end of the address. */
  topEmail: { ...t.caption, color: c.text, flex: 1, writingDirection: 'ltr', textAlign: 'left' },
  topCount: { ...t.caption, color: c.textSub, fontWeight: '600' },

  empty: { ...t.caption, color: c.textFaint, textAlign: 'center', paddingVertical: 12 },
}))
