/* ════════════════════════════════════════════════════════════════
   THE CREATION WIZARD'S RULES — which step, what it needs, what it saves.
   ════════════════════════════════════════════════════════════════
   The builder asks for everything at once: ~3,000px and 34 controls, and the
   first seven of them — internal name, publish, auto-confirm, Google Calendar,
   project, address, after-booking — are all administration. A coach opens a
   page about meetings and meets a registration form; the meetings themselves
   start 1,373px down. The order followed the data, not the person.

   So creation asks the questions in the order someone actually decides them:

     1. what do I offer      meeting types and their length
     2. when am I free       the days, and the hours in them
     3. how does it look     logo, heading, words
     4. what happens after   confirmation, calendar, thank-you
     5. where does it live   name, address, and whether it goes live

   Everything here is pure so the rules can be tested without a browser: the
   component owns the screen, this file owns what is true.
   ════════════════════════════════════════════════════════════════ */

import { hmToMinutes } from './bookingPageSchema'

/* In order. The component renders one at a time and never reorders them. */
export const WIZARD_STEPS = ['offer', 'when', 'look', 'after', 'publish']

export const stepIndex = (step) => WIZARD_STEPS.indexOf(step)
export const isLastStep = (step) => stepIndex(step) === WIZARD_STEPS.length - 1
export const nextStep = (step) => WIZARD_STEPS[stepIndex(step) + 1] ?? null
export const prevStep = (step) => (stepIndex(step) > 0 ? WIZARD_STEPS[stepIndex(step) - 1] : null)

/* Does this day hold at least one window that could seat a meeting? */
const dayHasHours = (windows) =>
  Array.isArray(windows) && windows.some((w) => hmToMinutes(w?.end) > hmToMinutes(w?.start))

export const openDays = (weekly) =>
  Object.values(weekly || {}).filter(dayHasHours).length

/* What stops this step from being finished — a KEY, not a sentence, so the
   copy stays in the locale files. null means the step is done.

   Only two steps can block, and both block on the thing the page cannot work
   without. Nothing else is required: a page with no meeting types offers one
   generic meeting, and a page with no words uses its defaults. Asking for more
   than this would be the old form again, wearing steps. */
export function stepBlocker(step, draft) {
  if (step === 'when' && openDays(draft?.availability?.weekly) === 0) {
    return 'needsHours'
  }
  if (step === 'publish' && !String(draft?.title ?? '').trim()) {
    return 'needsName'
  }
  return null
}

/* A page has to exist in the database before the coach can leave and come back
   to it, and it exists from the moment the first step is done — but the name is
   not asked until step 5. This is what it is called in between: visible in the
   list, obviously provisional, and replaced by whatever they type at the end.

   `taken` are the titles already in use; the suffix only appears when it must,
   so the first page is "דף חדש" and not "דף חדש 1". */
export function provisionalTitle(base, taken = []) {
  const used = new Set((taken || []).map((s) => String(s ?? '').trim()).filter(Boolean))
  if (!used.has(base)) return base
  for (let n = 2; n < 500; n += 1) {
    const candidate = `${base} ${n}`
    if (!used.has(candidate)) return candidate
  }
  return `${base} ${Date.now()}`
}

/* Was the title only ever the provisional one? Then step 5 offers an empty box
   rather than making them delete a name they never chose. */
export const isProvisionalTitle = (title, base) => {
  const s = String(title ?? '').trim()
  if (!s) return true
  return s === base || new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\d+$`).test(s)
}

/* Which steps are behind you — for the progress rail. A step counts as done
   once you have moved past it, never by guessing from its contents: a coach who
   deliberately offers no meeting types has finished step 1, and a rail that
   argued otherwise would be nagging about a decision they already made. */
export const stepsDone = (current) => WIZARD_STEPS.slice(0, Math.max(0, stepIndex(current)))
