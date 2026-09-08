import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { colors, type } from '../../theme/theme'
import i18n from '../../lib/i18n'
import { useOnboarding } from '../../lib/onboarding'
import OnboardingShell from './OnboardingShell'
import WelcomeGate from './WelcomeGate'
import { useStepCTA } from './useStepCTA'
import Step1Profile from './steps/Step1Profile'
import Step2Project from './steps/Step2Project'
import Step3Clients from './steps/Step3Clients'
import Step4Goals from './steps/Step4Goals'

/* The onboarding flow. Mirrors apps/web/src/screens/onboarding/index.jsx:
   the welcome gate shows until acknowledged, then the current step drives
   the body, and finishing releases the guard in App.js.

   The step BODIES are still placeholders — they land next, a pair at a
   time. Each one already speaks the real CTA contract, so swapping a
   placeholder for a real step changes only that file. */

/* Temporary stand-in for a step that has not been built yet. It publishes
   a CTA the way a real step will, and reports itself as not-yet-fillable
   so the shell offers "later" rather than claiming there is something to
   save. */
function StepPlaceholder({ step, setCTA }) {
  useStepCTA(setCTA, { onNext: undefined, canAdvance: false })
  return (
    <View style={styles.placeholder}>
      <Text style={styles.step}>{step}</Text>
      <Text style={styles.note}>{i18n.t('common:soon', { defaultValue: 'בקרוב' })}</Text>
    </View>
  )
}

const STEPS = {
  profile: Step1Profile,
  projects: Step2Project,
  clients: Step3Clients,
  goals: Step4Goals,
  finish: StepPlaceholder,
}

export default function OnboardingScreen() {
  const ob = useOnboarding()

  /* CTA descriptor lifted to the screen so the shell's footer can render
     the primary button outside the step body. Each step publishes its
     onNext/canAdvance/busy/hint through useStepCTA. */
  const [cta, setCTA] = useState(null)
  const StepComp = STEPS[ob.step] || STEPS.profile

  /* Stamp the start once the user is actually in the flow. A no-op after
     the first time — markStartedPatch returns null, so nothing is written
     and nothing can revert welcome_seen behind it. */
  useEffect(() => {
    if (ob.state.welcome_seen) ob.markStarted()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ob.state.welcome_seen])

  /* Finishing is guarded by a ref rather than state: the last step's CTA
     stays enabled, so a second press before the re-render would otherwise
     complete twice. Released on failure so a retry is possible. */
  const finishing = useRef(false)
  const onDone = useCallback(async () => {
    if (finishing.current) return
    finishing.current = true
    try {
      await ob.complete()
    } catch (e) {
      finishing.current = false
      throw e
    }
  }, [ob])

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

  return (
    <OnboardingShell ob={ob} cta={cta}>
      <StepComp key={ob.step} step={ob.step} ob={ob} onDone={onDone} setCTA={setCTA} />
    </OnboardingShell>
  )
}

const styles = StyleSheet.create({
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 40 },
  step: { ...type.displayL, color: colors.text },
  note: { ...type.caption, color: colors.textSub },
})
