import { useMemo, useState } from 'react'
import { View, Modal } from 'react-native'
import { ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft, X } from 'lucide-react-native'
import {
  monthGrid, monthNamesLong, weekdayNamesShort, isSameDay, weekStartIndex,
  hebrewMonthGrid, hebrewParts, hebrewMonthLabel, stepHebrewMonth, stepHebrewYear,
  fmtDateInput,
} from '@simplicity/core'
import { Pressable } from './Pressable'
import { Text } from './Text'
import i18n from '../lib/i18n'
import { usePreferences } from '../lib/preferences'
import { colors, shadow } from '../theme/theme'
import { themed } from '../theme/themed'

/* A date, picked rather than typed.
   ────────────────────────────────────────────────────────────────
   Every date in the app's forms was a free-text field with the placeholder
   "YYYY-MM-DD" — sixteen of them. Typing "2026-09-10" on a phone is the long
   way to choose tomorrow, and it asked for one format while the app showed
   every date the user READS in the format they chose in Settings
   (DD/MM/YY, MM/DD/YY or YYYY-MM-DD).

   This is web's DateField (apps/web/src/components/DateField.jsx), ported:
   same contract — `value` is a 'YYYY-MM-DD' string, onChange gets the same —
   and the same behaviour: the field shows the date in the user's own format,
   the calendar respects the week-start setting, and with "choose dates in the
   Hebrew calendar" on, the grid is a Hebrew month with gematria day numbers
   while the value stays Gregorian.

   The calendar floats, as it does on web, in a small dialog over the form.
   It first opened inline under the field, the way Select does — and in the
   half of the forms that set a date beside another field (date and time,
   amount and date) that put a seven-column month inside a 160-point column:
   day cells twenty points wide, a calendar nobody could hit. A dialog is the
   one place the month always gets the width of the screen. It is a Modal
   over the Sheet's Modal; Android back closes only the calendar.

   A date that is optional can be cleared. A text field could be emptied with
   the keyboard; a picker needs a way to say "no date", or a birthday entered
   by mistake could never be removed. The clear button is a SIBLING of the
   field, not a button inside it. */

const pad = (n) => String(n).padStart(2, '0')
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (v) => {
  if (!v) return null
  const d = new Date(typeof v === 'string' && v.length <= 10 ? `${v}T00:00:00` : v)
  return Number.isNaN(d.getTime()) ? null : d
}
const T = (k, o) => i18n.t(`components:dateField.${k}`, o)
// A View that claims the touch, so a tap on the calendar's own padding does
// not fall through to the backdrop and close it.
const absorb = () => true

export default function DateField({ value, onChange, placeholder, clearable = true, style }) {
  const { prefs } = usePreferences()
  const weekStart = prefs?.format?.week_start || 'sunday'
  /* Hebrew date-INPUT mode (Settings, independent of the display mode). The
     output stays a Gregorian YYYY-MM-DD — only the picker changes. */
  const hebrew = !!prefs?.design?.hebrew_date_input
  const dual = !!prefs?.design?.hebrew_calendar_dual
  const selected = parse(value)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => selected || new Date())

  const show = () => {
    const s = parse(value)
    setView(s || new Date())
    setOpen(true)
  }
  const close = () => setOpen(false)

  const cells = useMemo(() => {
    if (hebrew) {
      const ref = hebrewParts(view)
      return hebrewMonthGrid(view, weekStart).map((d) => {
        const p = hebrewParts(d)
        return { d, inMonth: p.month === ref.month && p.year === ref.year, label: p.dayText }
      })
    }
    const m = view.getMonth()
    return monthGrid(view, weekStart).map((d) => ({ d, inMonth: d.getMonth() === m, label: String(d.getDate()) }))
  }, [view, weekStart, hebrew])

  const headDays = useMemo(() => {
    const names = weekdayNamesShort(i18n.language)
    const start = weekStartIndex(weekStart)
    return Array.from({ length: 7 }, (_, i) => names[(start + i) % 7])
  }, [weekStart])

  const headerLabel = hebrew ? hebrewMonthLabel(view) : `${monthNamesLong()[view.getMonth()]} ${view.getFullYear()}`

  const shown = () => {
    if (!selected) return null
    if (!hebrew) return fmtDateInput(selected)
    const p = hebrewParts(selected)
    const heb = `${p.dayText} ב${p.month} ${p.yearText}`
    return dual ? `${heb} · ${fmtDateInput(selected)}` : heb
  }
  const shownText = shown()
  const ph = placeholder ?? T('placeholder')

  const pick = (d) => { onChange?.(isoOf(d)); close() }
  const clear = () => onChange?.('')
  const shiftMonth = (n) => setView((v) => (hebrew ? stepHebrewMonth(v, n) : new Date(v.getFullYear(), v.getMonth() + n, 1)))
  const shiftYear = (n) => setView((v) => (hebrew ? stepHebrewYear(v, n) : new Date(v.getFullYear() + n, v.getMonth(), 1)))
  const today = new Date()

  return (
    <View style={styles.row}>
      <Pressable
        style={[styles.control, style, styles.controlFill]}
        onPress={show}
        accessibilityLabel={shownText ? `${T('dialogLabel')}: ${shownText}` : ph}
        accessibilityState={{ expanded: open }}
      >
        <Text style={[styles.value, !shownText && styles.placeholder]} numberOfLines={1}>{shownText || ph}</Text>
      </Pressable>
      {clearable && selected ? (
        <Pressable style={styles.clear} onPress={clear} hitSlop={8} accessibilityLabel={T('clear')}>
          <X size={16} strokeWidth={1.8} color={colors.textSub} />
        </Pressable>
      ) : null}

      {/* Same flags as the sheets: without them the dim stops short of the
          status bar and leaves a bright strip across the top. */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
        <Pressable style={styles.backdrop} onPress={close} android_ripple={null} accessibilityLabel={i18n.t('common:close')}>
          <View style={styles.pop} onStartShouldSetResponder={absorb} accessibilityLabel={T('dialogLabel')}>
            <View style={styles.nav}>
              <Pressable style={styles.navBtn} onPress={() => shiftYear(-1)} accessibilityLabel={T('prevYear')}>
                <ChevronsRight size={18} strokeWidth={1.8} color={colors.textSub} />
              </Pressable>
              <Pressable style={styles.navBtn} onPress={() => shiftMonth(-1)} accessibilityLabel={T('prevMonth')}>
                <ChevronRight size={18} strokeWidth={1.8} color={colors.textSub} />
              </Pressable>
              <Text style={styles.month} numberOfLines={1}>{headerLabel}</Text>
              <Pressable style={styles.navBtn} onPress={() => shiftMonth(1)} accessibilityLabel={T('nextMonth')}>
                <ChevronLeft size={18} strokeWidth={1.8} color={colors.textSub} />
              </Pressable>
              <Pressable style={styles.navBtn} onPress={() => shiftYear(1)} accessibilityLabel={T('nextYear')}>
                <ChevronsLeft size={18} strokeWidth={1.8} color={colors.textSub} />
              </Pressable>
            </View>

            <View style={styles.dow}>
              {headDays.map((d, i) => <Text key={i} style={styles.dowText}>{d}</Text>)}
            </View>

            <View style={styles.grid}>
              {cells.map(({ d: cell, inMonth, label }) => {
                const isSel = !!selected && isSameDay(cell, selected)
                const isToday = isSameDay(cell, today)
                return (
                  <Pressable
                    key={isoOf(cell)}
                    style={[styles.day, isToday && styles.today, isSel && styles.sel]}
                    onPress={() => pick(cell)}
                    accessibilityLabel={fmtDateInput(cell)}
                    accessibilityState={{ selected: isSel }}
                  >
                    <Text style={[styles.dayText, !inMonth && styles.out, isSel && styles.selText]}>{label}</Text>
                  </Pressable>
                )
              })}
            </View>

            <Pressable style={styles.todayBtn} onPress={() => pick(new Date())}>
              <Text style={styles.todayText}>{T('today')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = themed((c, t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  control: {
    minHeight: 44, justifyContent: 'center',
    borderWidth: 1, borderColor: c.border, borderRadius: 12,
    paddingVertical: 11, paddingHorizontal: 14, backgroundColor: c.card,
  },
  // Applied after the caller's style so the field always shares the row.
  controlFill: { flex: 1 },
  value: { fontSize: 15, color: c.text },
  placeholder: { color: c.textFaint },
  clear: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.fill },
  backdrop: { flex: 1, backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  pop: { width: '100%', maxWidth: 360, borderWidth: 0.5, borderColor: c.border, borderRadius: 18, backgroundColor: c.card, padding: 12, gap: 6, ...shadow.card },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  navBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  month: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: c.text },
  dow: { flexDirection: 'row' },
  dowText: { width: '14.2857%', textAlign: 'center', fontSize: 12, color: c.textSub },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  day: { width: '14.2857%', height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  dayText: { fontSize: 15, color: c.text },
  out: { color: c.textFaint, opacity: 0.6 },
  today: { borderWidth: 1, borderColor: c.divider },
  sel: { backgroundColor: c.btnBg },
  selText: { color: c.onBtn, fontWeight: '600' },
  todayBtn: { minHeight: 44, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  todayText: { fontSize: 15, fontWeight: '600', color: c.brand },
}))
