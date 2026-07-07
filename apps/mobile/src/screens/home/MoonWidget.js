import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { BlurView } from 'expo-blur'
import Svg, { Circle } from 'react-native-svg'
import { moonGetData } from '@simplicity/core'
import i18n from '../../lib/i18n'
import { colors, shadow } from '../../theme/theme'

// "מבט על" — pace-aware overall goal score (shared core moonGetData) drawn as a
// circular ring chip, matching web's .moon-chip: a 132px glass circle with an
// SVG progress arc (sage), the confidence % + "מהקצב" in the centre, and a
// "{pure}% מהיעד" caption below. No goals → prompts to set one (→ Goals).
const SIZE = 132
const RADIUS = 42
const CIRC = 2 * Math.PI * RADIUS // ≈ 263.89, matches web

export default function MoonWidget({ data }) {
  const nav = useNavigation()
  const { overall } = useMemo(() => moonGetData(new Date(), data), [data])

  if (!overall) {
    return (
      <Pressable style={styles.wrap} onPress={() => nav.navigate('Goals')}>
        <Chip>
          <Text style={styles.num}>—</Text>
        </Chip>
        <Text style={styles.emptyLabel}>{i18n.t('home:widgets.moon.setGoal')}</Text>
      </Pressable>
    )
  }

  const conf = overall.confidence ?? 0
  const pure = overall.pure
  const pct = Math.min(100, Math.max(0, conf))
  const dash = (pct / 100) * CIRC

  return (
    <Pressable style={styles.wrap} onPress={() => nav.navigate('Moon')}>
      <Chip>
        {/* Rotate the whole SVG -90° (via RN style, not an SVG transform attr)
            so the arc starts at 12 o'clock — avoids react-native-svg-web's
            transform-origin DOM warning. */}
        <Svg width={SIZE} height={SIZE} viewBox="0 0 100 100" style={styles.ring}>
          <Circle cx="50" cy="50" r={RADIUS} fill="none" stroke="rgba(42,37,32,0.08)" strokeWidth={5} />
          <Circle
            cx="50" cy="50" r={RADIUS} fill="none"
            stroke={colors.positive} strokeWidth={7} strokeLinecap="round"
            strokeDasharray={`${dash} ${CIRC}`}
          />
        </Svg>
        <Text style={styles.num}>{conf}%</Text>
        <Text style={styles.kicker}>{i18n.t('home:widgets.moon.ofPace')}</Text>
      </Chip>
      {pure != null ? (
        <Text style={styles.caption}>{i18n.t('home:widgets.moon.percentOfGoal', { percent: pure })}</Text>
      ) : null}
    </Pressable>
  )
}

function Chip({ children }) {
  return (
    <View style={styles.chipShadow}>
      <View style={styles.chipClip}>
        <BlurView intensity={50} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.chipTint]} />
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8 },
  chipShadow: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, ...shadow.card },
  chipClip: {
    width: SIZE, height: SIZE, borderRadius: SIZE / 2, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center',
  },
  chipTint: { backgroundColor: colors.glassTint },
  ring: { ...StyleSheet.absoluteFillObject, transform: [{ rotate: '-90deg' }] },
  num: { fontSize: 26, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  kicker: { fontSize: 10, color: colors.textSub, marginTop: 1 },
  caption: { fontSize: 11, color: colors.textSub, textAlign: 'center' },
  emptyLabel: { fontSize: 11, color: colors.brand, fontWeight: '600', textAlign: 'center' },
})
