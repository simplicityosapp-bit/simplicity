/* ════════════════════════════════════════════════════════════════
   SETUP TASKS — the tail of onboarding, on the home screen.
   ════════════════════════════════════════════════════════════════
   Onboarding used to ask for all of these before the user had seen a
   single screen: upload a spreadsheet, choose daily questions, enter
   fixed expenses. They wait on the home card instead, and each reports
   whether it is done from the data, so the card empties as the user works
   and then retires itself — nothing to tick by hand, and nothing that
   claims to be done when it isn't.

   Shared so both apps retire the card on the same signals. Where a task
   LEADS is each app's own business (a route on web, a screen on the
   phone), so this returns only what the data says.
   ════════════════════════════════════════════════════════════════ */

export type SetupTaskKey = 'setup' | 'import' | 'questions' | 'recurring'

export interface SetupTask {
  key: SetupTaskKey
  done: boolean
  /** Only on 'setup': whether the flow was ever begun (resume vs. invite). */
  started?: boolean
}

export interface SetupTaskPrefs {
  onboarding?: { completed_at?: string | null; started_at?: string | null } | null
  setup?: { imported_at?: string | null } | null
  homeWelcomeDismissed?: boolean | null
}

export interface SetupTaskInput {
  prefs?: SetupTaskPrefs | null
  questions?: ReadonlyArray<{ active?: boolean | null } | null> | null
  recurring?: ReadonlyArray<unknown> | null
}

export function setupTasks({ prefs, questions, recurring }: SetupTaskInput = {}): SetupTask[] {
  const tasks: SetupTask[] = []
  /* Leaving the flow part-way only sets skipped_at, so the steps not reached
     are still theirs to finish. Listed first while that's true, and gone once
     completed_at lands — never shown ticked, since someone who simply finished
     onboarding never met it as a task. */
  if (!prefs?.onboarding?.completed_at) {
    tasks.push({ key: 'setup', done: false, started: !!prefs?.onboarding?.started_at })
  }
  /* Imported clients look exactly like typed ones, so there is no row whose
     existence means "done" — Settings records the act instead. Having clients
     must not count: onboarding creates one for everybody. */
  tasks.push({ key: 'import', done: !!prefs?.setup?.imported_at })
  /* A question row written without the flag is active — the column defaults true. */
  tasks.push({ key: 'questions', done: (questions || []).some((q) => !!q && q.active !== false) })
  tasks.push({ key: 'recurring', done: (recurring || []).length > 0 })
  return tasks
}

/* The card shows while anything is outstanding, until it is dismissed. */
export function showSetupCard(tasks: ReadonlyArray<SetupTask>, prefs?: SetupTaskPrefs | null): boolean {
  return tasks.some((task) => !task.done) && !prefs?.homeWelcomeDismissed
}
