import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import Svg, { Circle, Path, Polygon } from 'react-native-svg'
import { moonGetData, moonGetCategories, moonTrend, moonReflection } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import { colors } from '../theme/theme'
import { useGoalsData } from '../hooks/useGoalsData'

// Moon screen ("מבט על", mirrors web moon-glance core): a confidence ring +
// reflection, per-category pace/goal dual bars, and a 30-day trend line with
// avg/peak/today. (The cross-module overlay + guarded correlations are a later
// increment.)
const RING = 46
const CIRC = 2 * Math.PI * RING

export default function MoonScreen() {
  const nav = useNavigation()
  const { goals, categories, entries, transactions, clients, leads, answers, members, groups, loading, error, refetch } = useGoalsData()
  const data = useMemo(
    () => ({ goals, categories, entries, transactions, clients, leads, answers, members, groups }),
    [goals, categories, entries, transactions, clients, leads, answers, members, groups],
  )
  const { overall } = useMemo(() => moonGetData(new Date(), data), [data])
  const cats = useMemo(() => moonGetCategories(new Date(), data), [data])
  const trend = useMemo(() => moonTrend(30, new Date(), data), [data])

  const scores = trend.map((t) => t.score)
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
  const peak = scores.length ? Math.max(...scores) : 0
  const conf = overall?.confidence ?? 0
  const dash = (Math.min(100, Math.max(0, conf)) / 100) * CIRC

  // 30-day trend line (0-100 scored).
  const chart = useMemo(() => {
    const W = 300, H = 84, pad = 5
    if (trend.length < 2) return null
    const pts = trend.map((d, i) => [pad + (i / (trend.length - 1)) * (W - 2 * pad), H - pad - (d.score / 100) * (H - 2 * pad)])
    const line = pts.map((p) => p.map((n) => Math.round(n * 10) / 10).join(',')).join(' ')
    return { W, H, line, area: `${pad},${H - pad} ${line} ${W - pad},${H - pad}`, d: 'M' + pts.map((p) => p.join(',')).join(' L') }
  }, [trend])

  return (
    <Screen name="moon">
      {loading && !overall ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : !overall ? (
        <View style={styles.center}>
          <Text style={styles.empty}>{i18n.t('moon:empty.noGoals', { action: i18n.t('moon:empty.action', { defaultValue: 'הגדר/י' }), defaultValue: 'עדיין אין יעדים.' })}</Text>
          <Pressable style={styles.emptyBtn} onPress={() => nav.navigate('Goals')}><Text style={styles.emptyBtnText}>{i18n.t('goals:newGoal', { defaultValue: 'יעד חדש' })}</Text></Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          <ScreenHead title={i18n.t('moon:title', { defaultValue: 'מבט על' })} />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Hero ring + reflection */}
          <Card contentStyle={styles.hero}>
            <View style={styles.ringWrap}>
              <Svg width={132} height={132} viewBox="0 0 100 100" style={styles.ringSvg}>
                <Circle cx="50" cy="50" r={RING} fill="none" stroke={colors.divider} strokeWidth={5} />
                <Circle cx="50" cy="50" r={RING} fill="none" stroke={colors.moonDeep} strokeWidth={7} strokeLinecap="round" strokeDasharray={`${dash} ${CIRC}`} />
              </Svg>
              <Text style={styles.ringNum}>{conf}%</Text>
              <Text style={styles.ringKicker}>{i18n.t('moon:ring.kicker', { defaultValue: 'מהקצב' })}</Text>
            </View>
            <Text style={styles.ringSub}>{i18n.t('moon:ring.sub', { pct: overall.pure, defaultValue: `${overall.pure}% מהיעד` })}</Text>
            <Text style={styles.reflection}>{moonReflection(conf)}</Text>
          </Card>

          {/* By category */}
          {cats.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionH}>{i18n.t('moon:section.byCategory', { defaultValue: 'פירוק לפי קטגוריה' })}</Text>
              <Card contentStyle={styles.catCard}>
                {cats.map((c, i) => (
                  <View key={c.category.id} style={[styles.cat, i > 0 && styles.catBorder]}>
                    <View style={styles.catHead}>
                      <View style={[styles.catDot, { backgroundColor: c.category.color || colors.moonDeep }]} />
                      <Text style={styles.catName} numberOfLines={1}>{c.category.name}</Text>
                    </View>
                    <DualBar label={i18n.t('moon:dualBars.pace', { defaultValue: 'מהקצב' })} pct={c.confidence} color={colors.positive} />
                    <DualBar label={i18n.t('moon:dualBars.goal', { defaultValue: 'מהיעד' })} pct={c.pure} color={colors.moonDeep} />
                  </View>
                ))}
              </Card>
            </View>
          ) : null}

          {/* Trend */}
          {chart ? (
            <View style={styles.section}>
              <Text style={styles.sectionH}>{i18n.t('moon:section.trend', { defaultValue: 'המגמה לאורך זמן' })}</Text>
              <Card contentStyle={styles.trendCard}>
                <Svg viewBox={`0 0 ${chart.W} ${chart.H}`} width="100%" height={chart.H}>
                  <Polygon points={chart.area} fill={colors.moonDeep} fillOpacity={0.14} />
                  <Path d={chart.d} stroke={colors.moonDeep} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                </Svg>
                <View style={styles.trendStats}>
                  <TrendStat value={`${avg}%`} label={i18n.t('moon:trend.avg', { defaultValue: 'ממוצע' })} />
                  <TrendStat value={`${peak}%`} label={i18n.t('moon:trend.peak', { defaultValue: 'שיא' })} divided />
                  <TrendStat value={`${conf}%`} label={i18n.t('moon:trend.today', { defaultValue: 'היום' })} />
                </View>
              </Card>
            </View>
          ) : null}

          <Pressable style={styles.footerLink} onPress={() => nav.navigate('Goals')}>
            <Text style={styles.footerLinkText}>{i18n.t('moon:footerLink', { defaultValue: 'לניהול היעדים' })}</Text>
          </Pressable>
        </ScrollView>
      )}
    </Screen>
  )
}

function DualBar({ label, pct, color }) {
  const w = Math.min(100, Math.max(0, pct ?? 0))
  return (
    <View style={styles.dualRow}>
      <Text style={styles.dualLabel}>{label}</Text>
      <View style={styles.dualTrack}><View style={[styles.dualFill, { width: `${w}%`, backgroundColor: color }]} /></View>
      <Text style={styles.dualPct}>{w}%</Text>
    </View>
  )
}
function TrendStat({ value, label, divided }) {
  return (
    <View style={[styles.trendStat, divided && styles.trendStatDivided]}>
      <Text style={styles.trendStatV}>{value}</Text>
      <Text style={styles.trendStatL}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 40 },
  content: { paddingHorizontal: 20, paddingBottom: 96, gap: 16 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textFaint, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 999, backgroundColor: colors.brand },
  emptyBtnText: { fontSize: 14, fontWeight: '600', color: colors.onBrand },

  hero: { alignItems: 'center', paddingVertical: 20, gap: 6 },
  ringWrap: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center' },
  ringSvg: { ...StyleSheet.absoluteFillObject, transform: [{ rotate: '-90deg' }] },
  ringNum: { fontSize: 28, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  ringKicker: { fontSize: 11, color: colors.textSub, marginTop: 1 },
  ringSub: { fontSize: 12, color: colors.textSub },
  reflection: { fontSize: 13, color: colors.text, textAlign: 'center', lineHeight: 19, marginTop: 4, paddingHorizontal: 6 },

  section: { gap: 8 },
  sectionH: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '600', color: colors.textSub, letterSpacing: 0.6, backgroundColor: colors.fillStrong, paddingVertical: 3, paddingHorizontal: 12, borderRadius: 999, overflow: 'hidden' },
  catCard: { paddingVertical: 4, paddingHorizontal: 16 },
  cat: { paddingVertical: 12, gap: 8 },
  catBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  catHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catDot: { width: 9, height: 9, borderRadius: 5 },
  catName: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.text },
  dualRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dualLabel: { fontSize: 11, color: colors.textSub, width: 42 },
  dualTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: colors.fillStrong, overflow: 'hidden' },
  dualFill: { height: 7, borderRadius: 4 },
  dualPct: { fontSize: 11, color: colors.textSub, width: 34, textAlign: 'right' },

  trendCard: { paddingVertical: 14, paddingHorizontal: 14, gap: 12 },
  trendStats: { flexDirection: 'row' },
  trendStat: { flex: 1, alignItems: 'center', gap: 3 },
  trendStatDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.divider },
  trendStatV: { fontSize: 18, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  trendStatL: { fontSize: 10, color: colors.textSub, textTransform: 'uppercase', letterSpacing: 0.3 },

  footerLink: { alignSelf: 'center', paddingVertical: 8 },
  footerLinkText: { fontSize: 13, color: colors.brand, fontWeight: '500' },
})

DualBar.displayName = 'DualBar'
TrendStat.displayName = 'TrendStat'
