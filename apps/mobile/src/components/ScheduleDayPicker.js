import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Controlled weekday / interval picker (mirrors web ScheduleDayPicker). Three
// modes: every day / specific weekdays / every X days. Fires onChange({mode,days,x}).
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const MODES = [['every_day', 'everyDay'], ['days_of_week', 'specificDays'], ['every_x_days', 'everyXDays']]
const S = (k, o) => i18n.t(`components:schedule.${k}`, o)

export default function ScheduleDayPicker({ mode, days, x, onChange }) {
  const setMode = (m) => onChange({ mode: m, days, x })
  const toggleDay = (k) => {
    const next = days.includes(k) ? days.filter((d) => d !== k) : [...days, k]
    onChange({ mode, days: next, x })
  }
  const setX = (v) => onChange({ mode, days, x: v })

  return (
    <View style={styles.wrap}>
      <View style={styles.modes}>
        {MODES.map(([m, l]) => (
          <Pressable key={m} style={[styles.mode, mode === m && styles.modeOn]} onPress={() => setMode(m)}>
            <Text style={[styles.modeText, mode === m && styles.modeTextOn]}>{S(l)}</Text>
          </Pressable>
        ))}
      </View>

      {mode === 'days_of_week' ? (
        <View style={styles.dayPills}>
          {DAY_KEYS.map((dk, k) => (
            <Pressable key={k} style={[styles.day, days.includes(k) && styles.dayOn]} onPress={() => toggleDay(k)}>
              <Text style={[styles.dayText, days.includes(k) && styles.dayTextOn]}>{S(`dayShort.${dk}`)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {mode === 'every_x_days' ? (
        <View style={styles.xRow}>
          <Text style={styles.xLabel}>{S('every')}</Text>
          <TextInput style={styles.xInput} value={String(x)} onChangeText={setX} keyboardType="numeric" placeholderTextColor={colors.textFaint} />
          <Text style={styles.xLabel}>{S('days')}</Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  modes: { flexDirection: 'row', gap: 8 },
  mode: { flex: 1, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat, alignItems: 'center' },
  modeOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  modeText: { fontSize: 12.5, color: colors.textSub },
  modeTextOn: { color: colors.onBrand, fontWeight: '600' },
  dayPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  day: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayText: { fontSize: 13, color: colors.text },
  dayTextOn: { color: colors.onBrand, fontWeight: '600' },
  xRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  xLabel: { fontSize: 14, color: colors.textSub },
  xInput: { width: 64, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, fontSize: 15, color: colors.text, backgroundColor: colors.card, textAlign: 'center' },
})
