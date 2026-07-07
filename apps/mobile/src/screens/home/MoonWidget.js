import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { BlurView } from 'expo-blur'
import Svg, { Circle } from 'react-native-svg'
import { ArrowLeft } from 'lucide-react-native'
import { moonReflection } from '@simplicity/core'
import InfoPopover from '../../components/InfoPopover'
import Card from '../../components/Card'
import i18n from '../../lib/i18n'
import { colors, shadow } from '../../theme/theme'

// "מבט על" — pace-based confidence ring chip (mirrors web MoonWidget). Tapping
// toggles the inline expansion (rendered below the top row by HomeScreen):
// reflection + per-goal pace/goal dual bars + a "פירוט מלא" link. Empty state
// (no goals) routes to Goals. `overall`/`scored` come from moonGetData in Home.
const SIZE = 132
const RADIUS = 42
const CIRC = 2 * Math.PI * RADIUS

export default function MoonWidget({ overall, expanded, onToggle }) {
  const nav = useNavigation()

  if (!overall) {
    return (
      <Pressable style={styles.wrap} onPress={() => nav.navigate('Goals')}>
        <Chip><Text style={styles.num}>—</Text></Chip>
        <Text style={styles.emptyLabel}>{i18n.t('home:widgets.moon.setGoal')}</Text>
      </Pressable>
    )
  }

  const conf = overall.confidence ?? 0
  const pure = overall.pure
  const pct = Math.min(100, Math.max(0, conf))
  const dash = (pct / 100) * CIRC

  return (
    <Pressable style={styles.wrap} onPress={onToggle} accessibilityLabel={i18n.t('home:widgets.moon.glanceAria', { percent: conf })}>
      <Chip>
        <Svg width={SIZE} height={SIZE} viewBox="0 0 100 100" style={styles.ring}>
          <Circle cx="50" cy="50" r={RADIUS} fill="none" stroke={colors.divider} strokeWidth={5} />
          <Circle cx="50" cy="50" r={RADIUS} fill="none" stroke={colors.positive} strokeWidth={7} strokeLinecap="round" strokeDasharray={`${dash} ${CIRC}`} />
        </Svg>
        <Text style={styles.num}>{conf}%</Text>
        <Text style={styles.kicker}>{i18n.t('home:widgets.moon.ofPace')}</Text>
        {pure != null ? <Text style={styles.goalInside}>{i18n.t('home:widgets.moon.percentOfGoal', { percent: pure })}</Text> : null}
      </Chip>
      <View style={styles.labelRow}>
        <Text style={styles.chipLabel}>{i18n.t('home:widgets.moon.glance', { defaultValue: 'מבט על' })}</Text>
        <InfoPopover label={i18n.t('home:widgets.moon.infoLabel')} text={i18n.t('home:widgets.moon.infoText')} />
      </View>
    </Pressable>
  )
}

// Inline expansion — rendered full-width below the top row when the moon chip is
// expanded (Home lifts the state so this can break out of the moon column).
export function MoonExpansion({ scored = [], conf, gender, onFull }) {
  return (
    <Card contentStyle={styles.exp}>
      <Text style={styles.reflection}>{moonReflection(conf, gender)}</Text>
      {scored.length === 0 ? (
        <Text style={styles.expEmpty}>{i18n.t('home:widgets.moon.expandedEmpty')}</Text>
      ) : (
        scored.map((s) => (
          <View key={s.goal.id} style={styles.cat}>
            <View style={styles.catHead}>
              <View style={[styles.catDot, { backgroundColor: s.cat.color || colors.positive }]} />
              <Text style={styles.catName} numberOfLines={1}>{s.goal.label || s.cat.name}</Text>
            </View>
            <View style={styles.bars}>
              <DualBar label={i18n.t('moon:dualBars.pace', { defaultValue: 'מהקצב' })} pct={Math.min(100, s.paced)} color={colors.positive} />
              <DualBar label={i18n.t('moon:dualBars.goal', { defaultValue: 'מהיעד' })} pct={s.pure} color={colors.moonDeep} />
            </View>
          </View>
        ))
      )}
      <Pressable style={styles.link} onPress={onFull}>
        <Text style={styles.linkText}>{i18n.t('home:widgets.moon.fullDetail')}</Text>
        <ArrowLeft size={13} strokeWidth={1.8} color={colors.brand} />
      </Pressable>
    </Card>
  )
}

function DualBar({ label, pct, color }) {
  const w = Math.min(100, Math.max(0, pct ?? 0))
  return (
    <View style={styles.barCol}>
      <View style={styles.barHead}>
        <Text style={styles.barLbl}>{label}</Text>
        <Text style={styles.barVal}>{w}%</Text>
      </View>
      <View style={styles.barTrack}><View style={[styles.barFill, { width: `${w}%`, backgroundColor: color }]} /></View>
    </View>
  )
}

function Chip({ children }) {
  return (
    <View style={styles.chipShadow}>
      <View style={styles.chipClip}>
        <BlurView intensity={50} tint={colors.blurTint} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.chipTint]} />
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8 },
  chipShadow: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, ...shadow.card },
  chipClip: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, overflow: 'hidden', borderWidth: 1, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center' },
  chipTint: { backgroundColor: colors.glassTint },
  ring: { ...StyleSheet.absoluteFillObject, transform: [{ rotate: '-90deg' }] },
  num: { fontSize: 26, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  kicker: { fontSize: 10, color: colors.textSub, marginTop: 1 },
  goalInside: { fontSize: 9, color: colors.textFaint, fontWeight: '500', marginTop: 3, textAlign: 'center', fontVariant: ['tabular-nums'] },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  chipLabel: { fontSize: 11, fontWeight: '500', color: colors.textSub },
  emptyLabel: { fontSize: 11, color: colors.brand, fontWeight: '600', textAlign: 'center' },
  // expansion
  exp: { paddingVertical: 16, paddingHorizontal: 18, gap: 12, marginTop: 4 },
  reflection: { fontSize: 14, fontWeight: '500', color: colors.text, lineHeight: 20 },
  expEmpty: { fontSize: 13, color: colors.textFaint },
  cat: { gap: 6 },
  catHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catName: { flex: 1, fontSize: 13, fontWeight: '500', color: colors.text },
  bars: { flexDirection: 'row', gap: 14 },
  barCol: { flex: 1, gap: 4 },
  barHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barLbl: { fontSize: 11, color: colors.textSub },
  barVal: { fontSize: 11, fontWeight: '500', color: colors.textSub, fontVariant: ['tabular-nums'] },
  barTrack: { height: 5, borderRadius: 3, backgroundColor: colors.divider, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3 },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingTop: 4 },
  linkText: { fontSize: 13, fontWeight: '600', color: colors.brand },
})
