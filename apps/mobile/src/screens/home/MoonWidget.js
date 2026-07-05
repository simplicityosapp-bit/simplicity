import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { moonGetData, moonReflection } from '@simplicity/core'
import i18n from '../../lib/i18n'
import Card from '../../components/Card'
import { colors } from '../../theme/theme'

// "מבט על" — the pace-aware overall goal score (shared core moonGetData) + a
// one-line reflection. Simple progress bar (SVG ring is a later design pass).
// No goals → prompts to set one (→ Goals). Otherwise → Moon screen.
export default function MoonWidget({ data }) {
  const nav = useNavigation()
  const { overall } = useMemo(() => moonGetData(new Date(), data), [data])

  if (!overall) {
    return (
      <Pressable style={styles.wrap} onPress={() => nav.navigate('Goals')}>
        <Card padded={false} contentStyle={styles.emptyInner}>
          <Text style={styles.emptyText}>{i18n.t('home:widgets.moon.setGoal')}</Text>
        </Card>
      </Pressable>
    )
  }

  const conf = overall.confidence ?? 0
  const pure = overall.pure
  const pct = Math.min(100, Math.max(0, conf))

  return (
    <Pressable style={styles.wrap} onPress={() => nav.navigate('Moon')}>
      <Card padded={false} contentStyle={styles.inner}>
        <View style={styles.head}>
          <Text style={styles.num}>{conf}%</Text>
          <Text style={styles.kicker}>{i18n.t('home:widgets.moon.ofPace')}</Text>
          {pure != null ? (
            <Text style={styles.goalPct}>· {i18n.t('home:widgets.moon.percentOfGoal', { percent: pure })}</Text>
          ) : null}
        </View>
        <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
        <Text style={styles.reflection}>{moonReflection(conf)}</Text>
      </Card>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20 },
  inner: { paddingVertical: 18, paddingHorizontal: 18, gap: 12 },
  emptyInner: { paddingVertical: 18, paddingHorizontal: 18, alignItems: 'center' },
  emptyText: { color: colors.brand, fontSize: 15, fontWeight: '600' },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  num: { fontSize: 30, fontWeight: '600', color: colors.text },
  kicker: { fontSize: 14, color: colors.textSub },
  goalPct: { fontSize: 13, color: colors.textFaint },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(42,37,32,0.08)', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.positive },
  reflection: { fontSize: 14, color: colors.textSub, lineHeight: 20 },
})
