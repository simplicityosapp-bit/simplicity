import { View, Text, ActivityIndicator } from 'react-native'
import i18n from '../../lib/i18n'
import { colors } from '../../theme/theme'
import { themed } from '../../theme/themed'

const T = (k, o) => i18n.t(`admin:${k}`, o)

/* The loading / error strip every console tab shows above its content.

   `hasData` matters: a refetch that fails while you are already reading a
   tab keeps the last good payload on screen (see useAdmin), so the banner
   has to say "these figures may be stale" rather than replacing them. A
   first load that fails has nothing behind it and says so plainly. */
export function AdminState({ loading, error, hasData }) {
  if (loading && !hasData) {
    return (
      <View style={styles.state}>
        <ActivityIndicator size="small" color={colors.brand} />
        <Text style={styles.stateText}>{T('state.loading')}</Text>
      </View>
    )
  }
  if (error) {
    return (
      <View style={[styles.state, styles.stateErr]}>
        <Text style={styles.stateErrText}>{T('state.loadError')}</Text>
      </View>
    )
  }
  return null
}

/* A section heading, optionally with a leading icon (the dashboard's
   targets block uses one). */
export function SectionHead({ title, Icon }) {
  return (
    <View style={styles.head}>
      {Icon ? <Icon size={15} strokeWidth={1.8} color={colors.textSub} /> : null}
      <Text style={styles.headText}>{title}</Text>
    </View>
  )
}

/* A small pill — a status, a tier, a role. `tone` picks the accent. */
export function Pill({ label, tone = 'neutral' }) {
  return (
    <View style={[styles.pill, TONE[tone]]}>
      <Text style={[styles.pillText, TONE_TEXT[tone]]} numberOfLines={1}>{label}</Text>
    </View>
  )
}

const styles = themed((c, t) => ({
  state: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 22 },
  stateText: { ...t.caption, color: c.textSub },
  stateErr: { paddingVertical: 12, borderRadius: 12, backgroundColor: c.fill },
  stateErrText: { ...t.caption, color: c.danger, textAlign: 'center' },

  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, marginBottom: 8 },
  headText: { ...t.heading, fontSize: 15 },

  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontWeight: '600' },
}))

/* Tone maps live outside the sheet but must still follow the palette —
   themed() covers a stylesheet, and these are stylesheets of their own. */
const TONE = themed((c) => ({
  neutral: { backgroundColor: c.fill },
  brand: { backgroundColor: c.brandSoft },
  positive: { backgroundColor: 'rgba(139,168,136,0.18)' },
  amber: { backgroundColor: 'rgba(212,165,116,0.18)' },
  danger: { backgroundColor: 'rgba(181,99,78,0.16)' },
}))
const TONE_TEXT = themed((c) => ({
  neutral: { color: c.textSub },
  brand: { color: c.brand },
  positive: { color: c.positive },
  amber: { color: c.amberWarn },
  danger: { color: c.danger },
}))
