import { Sparkles, Folder, Users, Target } from 'lucide-react'
import { useT } from '../../../i18n/useT'
import { useStepCTA } from '../useStepCTA'
import { useProjects } from '../../../hooks/useProjects'
import { useClients } from '../../../hooks/useClients'
import { useGoals } from '../../../hooks/useGoals'
import { Box, Txt } from '../../../components/ui'

/* Step 5 — finish + final confirmation. The flow creates each entity LIVE
   as the user advances (project on step 2, clients on step 3, goal on step
   4), so there is nothing left to
   "create" here — but the user never saw a closing confirmation of what was
   set up. This step now SUMMARISES the live result (read-only, no second
   write, so nothing can double-create) and the primary CTA flips
   onboarding.completed_at and lands the user on /home.
   (No skip button on this last step — see OnboardingShell.) */
export default function Step5Finish({ ob, onDone, setCTA }) {
  const { t } = useT('onboardingSteps')
  const { projects } = useProjects()
  const { clients } = useClients()
  const { goals } = useGoals()

  useStepCTA(setCTA, { onNext: onDone, canAdvance: true, nextLabel: t('step5.nextLabel') })

  /* "מה הגדרנו יחד" has to mean exactly that. These were whole-account
     counts, which happen to match on a brand-new account and stop matching
     the moment they don't: someone who re-ran onboarding from Settings saw
     their entire history presented back as if it had just been set up here.

     Each step records the ids it created, so count those — intersected with
     the live rows, so anything since removed (step 3 lets you take a client
     back out) drops off rather than being claimed. Only non-empty lines are
     shown, so a skipped step doesn't leave a row of zeros. */
  const answers = ob?.state?.answers || {}
  const idSet = (v) => new Set((Array.isArray(v) ? v : []).filter(Boolean))
  const mine = (rows, ids) => (rows || []).filter((r) => ids.has(r.id)).length

  const summary = [
    { key: 'projects',  icon: Folder,   label: t('step5.projects'),  count: mine(projects, idSet(answers.projects?.created_ids)) },
    { key: 'clients',   icon: Users,    label: t('step5.clients'),   count: mine(clients, idSet(answers.clients?.created_ids)) },
    { key: 'goals',     icon: Target,   label: t('step5.goals'),     count: mine(goals, idSet(answers.goals?.created_ids)) },
  ].filter((s) => s.count > 0)

  return (
    <>
      <Txt as="p" className="ob-intro" style={{ justifyContent: 'center' }}>
        <Sparkles size={16} strokeWidth={1.7} aria-hidden="true" /> {t('step5.title')}
      </Txt>

      {summary.length > 0 ? (
        <Box className="ob-field">
          <Txt as="p" className="ob-label" style={{ display: 'inline-block' }}>{t('step5.summaryHeading')}</Txt>
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
            {t('step5.savedNote', { verb: t('step5.savedNoteVerb') })}
          </Txt>
        </Box>
      ) : (
        <Txt as="p" className="ob-empty-hint" style={{ textAlign: 'center' }}>
          {t('step5.emptyNote', { verb: t('step5.emptyNoteVerb') })}
        </Txt>
      )}

      <Box className="ob-field" style={{ textAlign: 'center' }}>
        <Txt as="p" className="ob-label" style={{ display: 'inline-block' }}>{t('step5.goodToKnow')}</Txt>
        <Box className="ob-about" style={{ fontFamily: 'var(--mg-font)', fontSize: 'calc(13.5px * var(--text-scale))', lineHeight: 1.75, color: 'var(--espresso)', textAlign: 'center' }}>
          <Txt as="p" style={{ margin: '0 0 10px' }}>{t('step5.about1')}</Txt>
          <Txt as="p" style={{ margin: '0 0 10px' }}>{t('step5.about2', { verb: t('step5.about2Verb') })}</Txt>
          <Txt as="p" style={{ margin: '0 0 10px' }}>{t('step5.about3', { allow: t('step5.about3AllowVerb'), like: t('step5.about3LikeVerb'), wish: t('step5.about3WishVerb') })}</Txt>
          <Txt as="p" style={{ margin: '0 0 10px' }}>{t('step5.about4')}</Txt>
          <Txt as="p" style={{ margin: 0, fontWeight: 600 }}>{t('step5.about5')}</Txt>
        </Box>
      </Box>

    </>
  )
}
