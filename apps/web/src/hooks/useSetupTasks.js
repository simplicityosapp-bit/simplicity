import { setupTasks } from '@simplicity/core'
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

   Which tasks exist and whether each is done comes from
   @simplicity/core/domain/setupTasks, which the phone's home card reads
   too — so the two apps retire the card on the same signals. What stays
   here is where each task leads, which is a route and so web's own.

   Shared by HomeWelcome (which renders them) and the home screen (which
   decides whether to show the card at all), hence its own file.
   ════════════════════════════════════════════════════════════════ */

const DESTINATIONS = {
  setup: { to: ROUTES.ONBOARDING, state: null },
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
  import: { to: ROUTES.SETTINGS, state: { openSection: 'data', openImport: true } },
  questions: { to: ROUTES.SETTINGS, state: { openSection: 'questions' } },
  recurring: { to: ROUTES.FINANCE, state: null },
}

export function useSetupTasks() {
  const { prefs } = useUserPreferences()
  const { questions } = useUserQuestions()
  const { templates: recurring } = useRecurring()
  return setupTasks({ prefs, questions, recurring }).map((task) => ({ ...task, ...DESTINATIONS[task.key] }))
}
