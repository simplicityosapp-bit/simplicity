import { useEffect } from 'react'
import { Sparkles, Folder, Users, Target, Repeat } from 'lucide-react'
import { useT } from '../../../i18n/useT'
import { useProjects } from '../../../hooks/useProjects'
import { useClients } from '../../../hooks/useClients'
import { useGoals } from '../../../hooks/useGoals'
import { useUserQuestions } from '../../../hooks/useUserQuestions'
import { useRecurring } from '../../../hooks/useRecurring'
import { Box, Txt } from '../../../components/ui'

/* Step 9 — finish + final confirmation. The manual onboarding path creates
   each entity LIVE as the user advances (project on step 3, clients on 4,
   questions on 5, goal on 6, recurring on 7), so there is nothing left to
   "create" here — but the user never saw a closing confirmation of what was
   set up. This step now SUMMARISES the live result (read-only, no second
   write, so nothing can double-create) and the primary CTA flips
   onboarding.completed_at and lands the user on /home.
   (No skip button on this last step — see OnboardingShell.) */
export default function Step9Finish({ onDone, setCTA }) {
  const { t } = useT('onboardingSteps')
  const { projects } = useProjects()
  const { clients } = useClients()
  const { goals } = useGoals()
  const { questions } = useUserQuestions()
  const { templates: recurring } = useRecurring()

  useEffect(() => {
    setCTA({ onNext: onDone, canAdvance: true, busy: false, hint: null, nextLabel: t('step9.nextLabel') })
  }, [onDone]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Live counts of what onboarding actually created — only non-empty rows
     are shown, so a user who skipped a step doesn't see a row of zeros. */
  const summary = [
    { key: 'projects',  icon: Folder,   label: t('step9.projects'),  count: (projects || []).length },
    { key: 'clients',   icon: Users,    label: t('step9.clients'),   count: (clients || []).length },
    { key: 'goals',     icon: Target,   label: t('step9.goals'),     count: (goals || []).length },
    { key: 'questions', icon: Sparkles, label: t('step9.questions'), count: (questions || []).filter((q) => q.active !== false).length },
    { key: 'recurring', icon: Repeat,   label: t('step9.recurring'), count: (recurring || []).length },
  ].filter((s) => s.count > 0)

  return (
    <>
      <Txt as="p" className="ob-intro" style={{ justifyContent: 'center' }}>
        <Sparkles size={16} strokeWidth={1.7} aria-hidden="true" /> {t('step9.title')}
      </Txt>

      {summary.length > 0 ? (
        <Box className="ob-field">
          <Txt as="p" className="ob-label" style={{ display: 'inline-block' }}>{t('step9.summaryHeading')}</Txt>
          <Box className="ob-finish-summary">
            {summary.map((s) => {
              const Icon = s.icon
              return (
                <Box key={s.key} className="ob-finish-row">
                  <Icon size={16} strokeWidth={1.6} aria-hidden="true" />
                  <Txt className="ob-finish-label">{s.label}</Txt>
                  <Txt className="ob-finish-count mono">{s.count}</Txt>
                </Box>
              )
            })}
          </Box>
          <Txt as="p" className="ob-empty-hint" style={{ marginTop: 8 }}>
            {t('step9.savedNote', { verb: t('step9.savedNoteVerb') })}
          </Txt>
        </Box>
      ) : (
        <Txt as="p" className="ob-empty-hint" style={{ textAlign: 'center' }}>
          {t('step9.emptyNote', { verb: t('step9.emptyNoteVerb') })}
        </Txt>
      )}

      <Box className="ob-field" style={{ textAlign: 'center' }}>
        <Txt as="p" className="ob-label" style={{ display: 'inline-block' }}>{t('step9.goodToKnow')}</Txt>
        <Box className="ob-about" style={{ fontFamily: 'var(--mg-font)', fontSize: 'calc(13.5px * var(--text-scale))', lineHeight: 1.75, color: 'var(--espresso)', textAlign: 'center' }}>
          <Txt as="p" style={{ margin: '0 0 10px' }}>{t('step9.about1')}</Txt>
          <Txt as="p" style={{ margin: '0 0 10px' }}>{t('step9.about2', { verb: t('step9.about2Verb') })}</Txt>
          <Txt as="p" style={{ margin: '0 0 10px' }}>{t('step9.about3', { allow: t('step9.about3AllowVerb'), like: t('step9.about3LikeVerb'), wish: t('step9.about3WishVerb') })}</Txt>
          <Txt as="p" style={{ margin: '0 0 10px' }}>{t('step9.about4')}</Txt>
          <Txt as="p" style={{ margin: 0, fontWeight: 600 }}>{t('step9.about5')}</Txt>
        </Box>
      </Box>

    </>
  )
}
