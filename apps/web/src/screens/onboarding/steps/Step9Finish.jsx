import { Sparkles, Folder, Users, Target, Repeat } from 'lucide-react'
import { useT } from '../../../i18n/useT'
import { useStepCTA } from '../useStepCTA'
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
export default function Step9Finish({ ob, onDone, setCTA }) {
  const { t } = useT('onboardingSteps')
  const { projects } = useProjects()
  const { clients } = useClients()
  const { goals } = useGoals()
  const { questions } = useUserQuestions()
  const { templates: recurring } = useRecurring()

  useStepCTA(setCTA, { onNext: onDone, canAdvance: true, nextLabel: t('step9.nextLabel') })

  /* "מה הגדרנו יחד" has to mean exactly that. These were whole-account
     counts, which happen to match on a brand-new account and stop matching
     the moment they don't: someone who re-ran onboarding from Settings saw
     their entire history presented back as if it had just been set up here.

     Each step records the ids it created, so count those — intersected with
     the live rows, so anything since removed (step 4 lets you take a client
     back out) drops off rather than being claimed. Only non-empty lines are
     shown, so a skipped step doesn't leave a row of zeros. */
  const answers = ob?.state?.answers || {}
  const idSet = (v) => new Set((Array.isArray(v) ? v : []).filter(Boolean))
  const mine = (rows, ids) => (rows || []).filter((r) => ids.has(r.id)).length

  /* Questions come from two steps: the daily-questions picker, and the one a
     goal tracked by a daily question creates for itself. */
  const questionIds = idSet([...(answers.daily_questions?.question_ids || []), answers.goals?.question_id])

  const summary = [
    { key: 'projects',  icon: Folder,   label: t('step9.projects'),  count: mine(projects, idSet(answers.projects?.created_ids)) },
    { key: 'clients',   icon: Users,    label: t('step9.clients'),   count: mine(clients, idSet(answers.clients?.created_ids)) },
    { key: 'goals',     icon: Target,   label: t('step9.goals'),     count: mine(goals, idSet(answers.goals?.created_ids)) },
    { key: 'questions', icon: Sparkles, label: t('step9.questions'), count: mine((questions || []).filter((q) => q.active !== false), questionIds) },
    { key: 'recurring', icon: Repeat,   label: t('step9.recurring'), count: mine(recurring, idSet(answers.recurring?.created_ids)) },
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
