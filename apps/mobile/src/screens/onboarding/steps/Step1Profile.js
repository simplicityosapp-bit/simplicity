import { useState } from 'react'
import { View, Text, TextInput, Pressable } from 'react-native'
import { colors, type } from '../../../theme/theme'
import { themed } from '../../../theme/themed'
import i18n from '../../../lib/i18n'
import { usePreferences, roleLabel } from '../../../lib/preferences'
import { useStepCTA } from '../useStepCTA'

/* Step 1 — name + form of address + role, with an "other" panel.
   Writes straight to prefs.profile and prefs.design.gender so the data is
   immediately useful everywhere else in the app, not only at the end of
   the flow.

   Native port of apps/web Step1Profile: same fields, same i18n keys, same
   rules about what counts as filled in. */

const GENDER_KEYS = [
  { k: 'female', labelKey: 'step1.genderFemale' },
  { k: 'male', labelKey: 'step1.genderMale' },
  { k: 'neutral', labelKey: 'step1.genderNeutral' },
]

/* Same keys and order as web's ROLE_LABELS, with "other" pinned last
   because it opens the custom-text panel. */
const ROLE_KEYS = ['therapist', 'coach', 'facilitator', 'teacher', 'instructor', 'other']

export default function Step1Profile({ ob, setCTA }) {
  const { prefs, update } = usePreferences()
  const t = (k, vars) => i18n.t('onboardingSteps:' + k, vars)

  const initial = ob.state.answers?.profile || {}
  const [name, setName] = useState(initial.name || prefs?.profile?.full_name || '')
  const [role, setRole] = useState(initial.role || prefs?.profile?.role || null)
  const [roleOther, setRoleOther] = useState(initial.role_other || prefs?.profile?.role_other || '')
  const [gender, setGender] = useState(initial.gender || prefs?.design?.gender || 'neutral')

  const rtl = (i18n.language || '').startsWith('he')
  const align = { textAlign: rtl ? 'right' : 'left' }

  const canAdvance = name.trim().length > 0 && (role !== 'other' || roleOther.trim().length > 0)
  const hint = canAdvance ? null : (!name.trim() ? t('step1.hintName') : t('step1.hintRole'))

  /* Both lines are gendered by the chosen form of address — the live pill
     state, before it is persisted. The explicit i18next context re-inflects
     them as the pill is toggled, ahead of the value reaching prefs. */
  const ctx = gender === 'male' || gender === 'female' ? gender : undefined
  const welcomeGreeting = t('step1.welcome', { context: ctx })
  const roleOtherLabel = t('step1.roleOtherLabel', { context: ctx })

  /* The role is genuinely optional, so an untouched one is stored as "not
     set" (null). It used to be filed as 'other' with no free text, which is
     a different claim entirely — the profile chip and Settings then showed
     the user as "אחר", a specialisation they never chose and had no reason
     to go looking for. */
  const onNext = async () => {
    const profile = {
      full_name: name.trim(),
      role: role || null,
      role_other: role === 'other' ? roleOther.trim() : '',
    }
    await update({ profile, design: { gender } })
    await ob.setAnswers('profile', {
      name: profile.full_name,
      role: profile.role,
      role_other: profile.role_other,
      gender,
    })
    await ob.advance()
  }

  /* No autoFocus. On web it is a convenience on a desktop; here it is an
     ambush — it opens the keyboard over the question before the reader has
     seen it. */
  useStepCTA(setCTA, { onNext, canAdvance, hint })

  return (
    <View style={styles.root}>
      <Text style={[styles.intro, align]}>{welcomeGreeting}</Text>
      {/* Why we are asking. It used to live behind a "?" most people never
          pressed, and every other step says its piece on the page. */}
      <Text style={[styles.introSub, align]}>{t('step1.introSub')}</Text>

      <View style={styles.field}>
        <Text style={[styles.label, align]}>{t('step1.nameLabel')}</Text>
        <TextInput
          style={[styles.input, align]}
          value={name}
          onChangeText={setName}
          placeholder={t('step1.namePlaceholder')}
          placeholderTextColor={colors.textFaint}
          returnKeyType="done"
        />
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, align]}>{t('step1.genderLabel')}</Text>
        <View style={styles.pills}>
          {GENDER_KEYS.map((g) => {
            const on = gender === g.k
            return (
              <Pressable
                key={g.k}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.pill, on && styles.pillOn]}
                onPress={() => setGender(g.k)}
              >
                <Text style={[styles.pillText, on && styles.pillTextOn]}>{t(g.labelKey)}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, align]}>{t('step1.roleLabel')}</Text>
        <View style={styles.pills}>
          {ROLE_KEYS.map((k) => {
            const on = role === k
            return (
              <Pressable
                key={k}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.pill, on && styles.pillOn]}
                onPress={() => setRole(k)}
              >
                {/* Resolved per render so the pills re-inflect live as the
                    form-of-address pill is toggled. */}
                <Text style={[styles.pillText, on && styles.pillTextOn]}>{roleLabel(k, gender)}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {role === 'other' ? (
        <View style={styles.field}>
          <Text style={[styles.label, align]}>{roleOtherLabel}</Text>
          <TextInput
            style={[styles.input, align]}
            value={roleOther}
            onChangeText={setRoleOther}
            placeholder={t('step1.roleOtherPlaceholder')}
            placeholderTextColor={colors.textFaint}
            returnKeyType="done"
          />
        </View>
      ) : null}
    </View>
  )
}

const styles = themed((c, t) => ({
  root: { gap: 14 },
  intro: { ...t.heading, color: c.text },
  introSub: { ...t.caption, color: c.textSub },
  field: { gap: 7 },
  label: { ...t.caption, color: c.textSub },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    fontSize: 15,
    color: c.text,
    backgroundColor: c.card,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexGrow: 1,
    minWidth: 68,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.cardFlat,
    alignItems: 'center',
  },
  pillOn: { backgroundColor: c.brand, borderColor: c.brand },
  pillText: { fontSize: 14, color: c.text },
  pillTextOn: { color: c.onBrand, fontWeight: '600' },
}))
