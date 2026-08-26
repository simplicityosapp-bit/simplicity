import { Text, StyleSheet, I18nManager } from 'react-native'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// A one-line count under the screen header — "42 לקוחות", "8 יעדים".
//
// These used to ride in ScreenHead's `meta` chips. The header rule (owner,
// 2026-07-29) is screen name + its icon and nothing else, so the chips went —
// but on web that rule RELOCATED the counts rather than deleting them (the
// clients hero states them, goals computes totalGoals). Four mobile screens had
// no such carrier, so stripping the header left their count with no home at
// all. This is the home.
//
// Deliberately not a card: it is a caption for the list beneath it, not a
// figure competing with one. Screens that already own a hero (tasks, projects,
// finance) state their numbers there and do not need this.
//
// RTL: same reasoning as ScreenHead — I18nManager.forceRTL only takes effect
// after a restart and RN Web ignores it, so a Hebrew UI can render on an LTR
// engine. Align explicitly off the LANGUAGE rather than off the engine.
export default function ScreenCount({ children }) {
  if (children === null || children === undefined || children === '') return null
  const rtl = (i18n.language || '').startsWith('he')
  return (
    <Text style={[styles.count, { textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
      {children}
    </Text>
  )
}

const styles = StyleSheet.create({
  count: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSub,
    marginTop: -4,
    marginBottom: 2,
    /* Matches the header card's inset so the caption lines up with the title
       above it rather than with the screen edge. */
    paddingHorizontal: 4,
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
  },
})
