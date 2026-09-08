import { useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, I18nManager } from 'react-native'
import { ChevronLeft, ChevronRight, Info } from 'lucide-react-native'
import { colors, radius, space, type } from '../../theme/theme'
import i18n from '../../lib/i18n'
import Screen from '../../components/Screen'
import OnboardingTree from './OnboardingTree'

/* Layout — every step shares this frame; only the body changes:
     1. Progress strip, first thing on screen
     2. Header — the counter as a small line above the growing tree
     3. Body — the step's own fields, scrollable so a keyboard cannot
        bury them
     4. Footer — back · hint + primary, with the way out beneath
   The step publishes onNext/canAdvance/busy/hint through useStepCTA; the
   shell only renders the buttons.

   Mirrors apps/web OnboardingShell, minus three things that do not apply
   here rather than being dropped:

   · No form/Enter handling — there is no implicit submission on a phone,
     and each step's keyboard "done" belongs to its own field.
   · No focus move between steps. The web shell moves DOM focus to the new
     question because advancing left focus on <body>; React Native has no
     equivalent trap, and the screen reader reads the new screen anyway.
   · No theme toggle. Web offers one in the corner, but this app freezes
     StyleSheet colours at boot, so changing the palette calls
     persistThemeAndReload — restarting the app in the middle of the flow.
     Introducing yourself to someone should not require rebooting them.
     The toggle stays where it already lives, in the drawer. */
export default function OnboardingShell({ ob, cta, children }) {
  const [skipping, setSkipping] = useState(false)
  const [exiting, setExiting] = useState(false)

  const rtl = (i18n.language || '').startsWith('he')
  const BackArrow = rtl ? ChevronRight : ChevronLeft
  const align = { textAlign: rtl ? 'right' : 'left' }
  const t = (k, vars) => i18n.t('onboarding:' + k, vars)

  /* The primary CTA is async on most steps. Wired straight through, a
     rejection became an unhandled promise rejection: the user pressed and
     nothing moved, with nothing saying why. Most visible on the last step,
     where finishing re-throws on a failed save — by design, so a retry is
     possible — but the throw had nowhere to land. */
  const runNext = async () => {
    try {
      await cta?.onNext?.()
    } catch {
      Alert.alert(t('shell.saveFailed'))
    }
  }

  /* Advance without recording the step. Reset the flag on BOTH paths: on a
     non-last step this only moves forward and the shell stays mounted, so
     without it the guard would block every later skip. */
  const onSkipStep = async () => {
    if (skipping) return
    setSkipping(true)
    try { await ob.skipStep() } finally { setSkipping(false) }
  }

  /* Leave the flow. Deliberately reachable from every step: when it was
     offered only once, on the welcome screen, someone who stalled on step
     three had no way out but to skip through every remaining step. This
     sets skipped_at, which releases the gate and still lets the home setup
     card bring them back to where they left. */
  const onExit = async () => {
    if (exiting) return
    setExiting(true)
    try {
      await ob.skipAll()
    } catch {
      setExiting(false)
      Alert.alert(t('shell.saveFailed'))
    }
  }

  const isFirst = ob.stepIndex === 0
  const canAdvance = !!cta?.canAdvance
  const busy = !!cta?.busy

  /* The primary button is never dead. A step with nothing in it offers to
     move on instead of greying out — disabling it on arrival and leaving a
     small "skip" link as the only way forward reads as the app being
     stuck. Filled → it saves; empty or not yet valid → it says so and
     moves on, and the hint beside it says what filling it in would get. */
  const primaryLabel = busy
    ? t('shell.saving')
    : (canAdvance ? (cta?.nextLabel || t('shell.next')) : t('shell.later'))
  const onPrimary = canAdvance ? runNext : onSkipStep

  return (
    <Screen name="home">
      <View style={styles.frame}>
        <View style={styles.track} accessibilityRole="progressbar">
          <View style={[styles.fill, { flex: Math.max(ob.progress, 0.001) }]} />
          <View style={{ flex: Math.max(1 - ob.progress, 0.001) }} />
        </View>

        <View style={styles.head}>
          <Text style={styles.counter}>
            {t('shell.stepCounter', {
              current: ob.stepIndex + 1,
              total: ob.total,
            })}
          </Text>
          <OnboardingTree stepIndex={ob.stepIndex} />
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>

        <View style={styles.foot}>
          {cta?.hint ? (
            <View style={[styles.hintRow, rtl && styles.rowRtl]}>
              <Info size={13} strokeWidth={2} color={colors.textFaint} />
              <Text style={[styles.hint, align]}>{cta.hint}</Text>
            </View>
          ) : null}

          <View style={[styles.footRow, rtl && styles.rowRtl]}>
            <Pressable
              accessibilityRole="button"
              onPress={ob.back}
              disabled={isFirst}
              style={({ pressed }) => [styles.back, isFirst && styles.disabled, pressed && styles.pressed]}
            >
              <BackArrow size={16} strokeWidth={1.5} color={colors.text} />
              <Text style={styles.backLabel}>{t('shell.back')}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={onPrimary}
              disabled={busy || skipping || !cta}
              style={({ pressed }) => [
                styles.primary,
                !canAdvance && styles.primaryQuiet,
                (busy || skipping || !cta) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.primaryLabel, !canAdvance && styles.primaryQuietLabel]}>
                {skipping ? t('shell.saving') : primaryLabel}
              </Text>
            </Pressable>
          </View>

          {/* The way out. Deliberately the quietest thing here — a text
              link under the buttons, not a third control competing. */}
          <Pressable accessibilityRole="button" onPress={onExit} disabled={exiting}>
            <Text style={styles.exit}>
              {exiting ? t('shell.saving') : t('shell.exit')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  frame: { flex: 1, paddingTop: space.headerTop, paddingHorizontal: space.screenPadH },
  track: { flexDirection: 'row', height: 4, borderRadius: 2, backgroundColor: colors.fill, overflow: 'hidden' },
  fill: { backgroundColor: colors.brand },
  head: { alignItems: 'center', paddingTop: 14, gap: 2 },
  counter: { ...type.micro, color: colors.textFaint },
  body: { flex: 1 },
  bodyContent: { paddingTop: 10, paddingBottom: 18, gap: 12 },
  foot: { paddingBottom: 22, gap: 10 },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowRtl: { flexDirection: 'row-reverse' },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hint: { ...type.micro, color: colors.textFaint, flex: 1 },
  back: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  backLabel: { ...type.body, color: colors.text },
  primary: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.btnBg,
  },
  primaryQuiet: { backgroundColor: colors.fillStrong },
  primaryLabel: { ...type.body, color: colors.onBtn },
  primaryQuietLabel: { color: colors.text },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  exit: { ...type.caption, color: colors.textSub, textAlign: 'center', textDecorationLine: 'underline' },
})
