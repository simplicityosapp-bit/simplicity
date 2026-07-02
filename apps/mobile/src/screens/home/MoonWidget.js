import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { moonGetData, moonReflection } from '@simplicity/core'
import i18n from '../../lib/i18n'

// "מבט על" — the pace-aware overall goal score (shared core moonGetData) + a
// one-line reflection. Simple progress bar (no SVG ring yet — that's a design
// pass). No goals → prompts to set one (→ Goals). Otherwise → Moon screen.
export default function MoonWidget({ data }) {
  const nav = useNavigation()
  const { overall } = useMemo(() => moonGetData(new Date(), data), [data])

  if (!overall) {
    return (
      <Pressable style={[styles.card, styles.empty]} onPress={() => nav.navigate('Goals')}>
        <Text style={styles.emptyText}>{i18n.t('home:widgets.moon.setGoal')}</Text>
      </Pressable>
    )
  }

  const conf = overall.confidence ?? 0
  const pure = overall.pure
  const pct = Math.min(100, Math.max(0, conf))

  return (
    <Pressable style={styles.card} onPress={() => nav.navigate('Moon')}>
      <View style={styles.head}>
        <Text style={styles.num}>{conf}%</Text>
        <Text style={styles.kicker}>{i18n.t('home:widgets.moon.ofPace')}</Text>
        {pure != null ? (
          <Text style={styles.goalPct}>· {i18n.t('home:widgets.moon.percentOfGoal', { percent: pure })}</Text>
        ) : null}
      </View>
      <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
      <Text style={styles.reflection}>{moonReflection(conf)}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    marginTop: 20, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#efe7da',
    paddingVertical: 18, paddingHorizontal: 18, gap: 12,
  },
  empty: { alignItems: 'center' },
  emptyText: { color: '#C97B5E', fontSize: 15, fontWeight: '600' },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  num: { fontSize: 30, fontWeight: '600', color: '#3a342e' },
  kicker: { fontSize: 14, color: '#7c6f63' },
  goalPct: { fontSize: 13, color: '#a89f95' },
  track: { height: 8, borderRadius: 4, backgroundColor: '#efe7da', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: '#8BA888' },
  reflection: { fontSize: 14, color: '#5a534a', lineHeight: 20 },
})
