import { useUserPreferences } from './useUserPreferences'
import { useUserQuestions } from './useUserQuestions'
import { useRecurring } from './useRecurring'
import { ROUTES } from '../lib/routes'

/* ════════════════════════════════════════════════════════════════
   useSetupTasks — the tail of onboarding, on the home screen.
   ════════════════════════════════════════════════════════════════
   Onboarding asked for all three of these before the user had seen a
   single screen: upload your spreadsheet and map its columns, choose
   daily questions, enter your fixed expenses. They now wait on the home
   card, and each one opens the real screen it belongs to.

   Each task reports whether it's done from the data, so the card empties
   as the user works and then retires itself — nothing to tick off by
   hand, and nothing that claims to be done when it isn't.

   Shared by HomeWelcome (which renders them) and the home screen (which
   decides whether to show the card at all), hence its own file.
   ════════════════════════════════════════════════════════════════ */

export function useSetupTasks() {
  const { prefs } = useUserPreferences()
  const { questions } = useUserQuestions()
  const { templates: recurring } = useRecurring()

  /* Imported clients look exactly like typed ones, so unlike the other
     two there is no row whose existence means "done" — Settings records
     the act instead (see its onImported). */
  const imported = !!prefs?.setup?.imported_at
  const hasQuestion = (questions || []).some((q) => q.active !== false)
  const hasRecurring = (recurring || []).length > 0

  /* Leaving the flow part-way only sets skipped_at, so the steps they
     didn't reach are still theirs to finish. Listed FIRST while that's
     true, and gone once completed_at lands — never shown ticked, since a
     user who simply finished onboarding never met it as a task. */
  const onboardingUnfinished = !prefs?.onboarding?.completed_at

  return [
    ...(onboardingUnfinished
      ? [{ key: 'setup', done: false, started: !!prefs?.onboarding?.started_at, to: ROUTES.ONBOARDING, state: null }]
      : []),
    /* `openImport` lands them ON the import button — scrolled to, focused and
       briefly called out — instead of somewhere inside a section holding three
       identical-looking buttons. The card promises "נעביר אותו פנימה יחד"; it
       shouldn't then leave them hunting for the way in. We stop short of
       opening the file picker itself: a programmatic click on a file input
       needs a live user gesture and iOS Safari ignores it outright, and a
       dialog that appears on some phones but not others is worse than one
       unmistakable button. */
    /* Section only — the group is DERIVED from it (groupOfSection). Both rows
       used to name a group as well, and both named one that does not exist:
       'data' (the section's own key; its group is 'account') and 'workflow'
       (the group is 'work'). An explicit value beats the derivation, so the
       wrong one won and settings opened fully collapsed — every task on the
       home card led to a screen with nothing on it. Naming the section alone
       is what settingsTree's comment asks for, and it cannot drift. */
    { key: 'import',    done: imported,     to: ROUTES.SETTINGS, state: { openSection: 'data', openImport: true } },
    { key: 'questions', done: hasQuestion,  to: ROUTES.SETTINGS, state: { openSection: 'questions' } },
    { key: 'recurring', done: hasRecurring, to: ROUTES.FINANCE,  state: null },
  ]
}
