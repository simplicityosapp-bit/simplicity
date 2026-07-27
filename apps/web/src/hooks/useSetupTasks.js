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

  return [
    { key: 'import',    done: imported,     to: ROUTES.SETTINGS, state: { openGroup: 'data', openSection: 'data' } },
    { key: 'questions', done: hasQuestion,  to: ROUTES.SETTINGS, state: { openGroup: 'workflow', openSection: 'questions' } },
    { key: 'recurring', done: hasRecurring, to: ROUTES.FINANCE,  state: null },
  ]
}
