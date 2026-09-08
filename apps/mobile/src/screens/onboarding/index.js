import { useEffect } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { colors, radius, space, type } from '../../theme/theme'
import i18n from '../../lib/i18n'
import Screen from '../../components/Screen'
import { useOnboarding } from '../../lib/onboarding'
import WelcomeGate from './WelcomeGate'

/* The onboarding flow. Mirrors apps/web/src/screens/onboarding/index.jsx:
   the welcome gate shows until acknowledged, then the current step drives
   the body, and finishing releases the guard in App.js.

   The step BODIES are still placeholders — they land next, one pair of
   steps at a time. What is real here is the navigation: every control
   below drives the shared state machine in @simplicity/core, so the flow
   can be walked end to end and the guard actually released. That is worth
   having early, because the web preview cannot exercise these transitions
   at all (its mock does not persist onboarding writes). */

function StepPlaceholder({ step }) {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderStep}>{step}</Text>
      <Text style={styles.placeholderNote}>
        {i18n.t('common:loading', { defaultValue: 'בקרוב' })}
      </Text>
    </View>
  )
}

export default function OnboardingScreen() {
  const ob = useOnboarding()

  /* Stamp the start once the user is actually in the flow. A no-op after
     the first time — markStartedPatch returns null, so nothing is written
     and nothing can revert welcome_seen behind it. */
  useEffect(() => {
    if (ob.state.welcome_seen) ob.markStarted()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ob.state.welcome_seen])

  if (!ob.state.welcome_seen) {
    return (
      <WelcomeGate
        onStart={async () => {
          await ob.seeWelcome()
          await ob.markStarted()
        }}
        onSkip={async () => {
          await ob.seeWelcome()
          await ob.skipAll()
        }}
      />
    )
  }

  const t = (k, fallback) => i18n.t('onboarding:' + k, { defaultValue: fallback })
  const isFirst = ob.stepIndex === 0

  return (
    <Screen name="home">
      <View style={styles.root}>
        <Text style={styles.progress}>
          {t('progress', 'צעד {{n}} מתוך {{total}}')
            .replace('{{n}}', String(ob.stepIndex + 1))
            .replace('{{total}}', String(ob.total))}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { flex: ob.progress }]} />
          <View style={{ flex: 1 - ob.progress }} />
        </View>

        <StepPlaceholder step={ob.step} />

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            disabled={isFirst}
            onPress={ob.back}
            style={({ pressed }) => [styles.ghost, isFirst && styles.disabled, pressed && styles.pressed]}
          >
            <Text style={styles.ghostLabel}>{t('back', 'חזרה')}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={ob.advance}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.primaryLabel}>{t('next', 'הלאה')}</Text>
          </Pressable>
        </View>

        <View style={styles.exits}>
          <Pressable accessibilityRole="button" onPress={ob.skipStep}>
            <Text style={styles.exitLabel}>{t('skipStep', 'לדלג על הצעד')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={ob.skipAll}>
            <Text style={styles.exitLabel}>{t('skipAll', 'לצאת מההיכרות')}</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: space.headerTop, paddingHorizontal: space.screenPadH, gap: 14 },
  progress: { ...type.caption, color: colors.textSub, textAlign: 'center' },
  track: { flexDirection: 'row', height: 4, borderRadius: 2, backgroundColor: colors.fill, overflow: 'hidden' },
  fill: { backgroundColor: colors.brand },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  placeholderStep: { ...type.displayL, color: colors.text },
  placeholderNote: { ...type.caption, color: colors.textSub },
  footer: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  ghost: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  ghostLabel: { ...type.body, color: colors.text },
  primary: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.btnBg,
  },
  primaryLabel: { ...type.body, color: colors.onBtn },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
  exits: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 24 },
  exitLabel: { ...type.caption, color: colors.textSub, textDecorationLine: 'underline' },
})
