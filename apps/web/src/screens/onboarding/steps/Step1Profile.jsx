import { useState, useEffect } from 'react'
import { useUserPreferences } from '../../../hooks/useUserPreferences'
import { ROLE_LABELS, roleLabel } from '../../../lib/preferences'
import { useT } from '../../../i18n/useT'
import { Box, Txt, Btn, Input } from '../../../components/ui'

/* Form-of-address pills — labels resolved from i18n. */
const GENDER_KEYS = [
  { k: 'female',  labelKey: 'step1.genderFemale' },
  { k: 'male',    labelKey: 'step1.genderMale' },
  { k: 'neutral', labelKey: 'step1.genderNeutral' },
]

/* Drive the role pills from the canonical ROLE_LABELS so onboarding, Settings
   and the profile chip always show identical labels ("other" pinned last as
   it opens the custom-text panel). Labels are resolved per-render via
   roleLabel() so the pills re-inflect live as the gender pill is toggled. */
const ROLE_KEYS = [
  ...Object.keys(ROLE_LABELS).filter((k) => k !== 'other'),
  'other',
]

/* Step 1 — name + gender (side-by-side) + role + optional "other" panel.
   Writes directly to prefs.profile + prefs.design.gender so the data
   is immediately useful elsewhere in the app. Picking "אחר" opens a
   sub-panel for the custom role text. */
export default function Step1Profile({ ob, setCTA }) {
  const { t } = useT('onboardingSteps')
  const { prefs, update } = useUserPreferences()
  const initial = ob.state.answers?.profile || {}
  const [name, setName] = useState(initial.name || prefs?.profile?.full_name || '')
  const [role, setRole] = useState(initial.role || prefs?.profile?.role || null)
  const [roleOther, setRoleOther] = useState(initial.role_other || prefs?.profile?.role_other || '')
  const [gender, setGender] = useState(initial.gender || prefs?.design?.gender || 'neutral')
  const canAdvance = name.trim().length > 0 && (role !== 'other' || roleOther.trim().length > 0)
  const hint = !canAdvance
    ? (!name.trim() ? t('step1.hintName') : t('step1.hintRole'))
    : null

  /* Both lines are gendered by the chosen form of address (the live
     `gender` pill state, before it's persisted). The explicit i18next
     context re-inflects them live as the form-of-address pill is toggled,
     ahead of the value being persisted to prefs. */
  const ctx = gender === 'male' || gender === 'female' ? gender : undefined
  const welcomeGreeting = t('step1.welcome', { context: ctx })
  const roleOtherLabel = t('step1.roleOtherLabel', { context: ctx })

  useEffect(() => { ob.markStarted() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onNext = async () => {
    await update({
      profile: {
        full_name: name.trim(),
        role: role || 'other',
        role_other: role === 'other' ? roleOther.trim() : '',
      },
      design: { gender },
    })
    await ob.setAnswers('profile', {
      name: name.trim(),
      role: role || 'other',
      role_other: role === 'other' ? roleOther.trim() : '',
      gender,
    })
    await ob.advance()
  }

  /* Push the latest CTA state up to the shell so the footer's "הלאה"
     stays in sync with the form. Deps cover every input that affects
     canAdvance / onNext closure. */
  useEffect(() => {
    setCTA({ onNext, canAdvance, busy: false, hint })
  }, [name, role, roleOther, gender, canAdvance, hint]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Txt as="p" className="ob-intro-sub">{welcomeGreeting}</Txt>

      <Box className="ob-field-row">
        <Box className="ob-field">
          <Box as="label" className="ob-label" htmlFor="ob-name">{t('step1.nameLabel')}</Box>
          <Input
            id="ob-name"
            className="ob-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('step1.namePlaceholder')}
            autoFocus
          />
        </Box>

        <Box className="ob-field">
          <Txt as="p" className="ob-label">{t('step1.genderLabel')}</Txt>
          <Box className="ob-pills">
            {GENDER_KEYS.map((g) => (
              <Btn
                key={g.k}
                type="button"
                className={`ob-pill${gender === g.k ? ' on' : ''}`}
                onClick={() => setGender(g.k)}
              >
                {t(g.labelKey)}
              </Btn>
            ))}
          </Box>
        </Box>
      </Box>

      <Box className="ob-field">
        <Txt as="p" className="ob-label">{t('step1.roleLabel')}</Txt>
        <Box className="ob-pills">
          {ROLE_KEYS.map((k) => (
            <Btn
              key={k}
              type="button"
              className={`ob-pill${role === k ? ' on' : ''}`}
              onClick={() => setRole(k)}
            >
              {roleLabel(k, gender)}
            </Btn>
          ))}
        </Box>
      </Box>

      {role === 'other' && (
        <Box className="ob-field ob-other-panel">
          <Box as="label" className="ob-label" htmlFor="ob-role-other">{roleOtherLabel}</Box>
          <Input
            id="ob-role-other"
            className="ob-input"
            value={roleOther}
            onChange={(e) => setRoleOther(e.target.value)}
            placeholder={t('step1.roleOtherPlaceholder')}
            autoFocus
          />
        </Box>
      )}
    </>
  )
}
