/* ════════════════════════════════════════════════════════════════
   SENSITIVE EXPORT LOADER — fetches the opt-in export categories
   through the api layer, so every field arrives already DECRYPTED
   (see lib/fieldCrypto.js — read decrypts notes/summary/reflection).
   ════════════════════════════════════════════════════════════════
   Kept separate from lib/export.js so that file stays a pure formatter
   (no Supabase, no crypto). Returns the `sensitive` payload that
   exportAllXLSX appends as extra sheets, or null when nothing is
   selected. Reference tables (groups / goal categories / questions)
   are fetched only when a category that needs them is selected, so an
   unrelated export costs no extra round-trips.
   ════════════════════════════════════════════════════════════════ */

import { listSessions } from './api/sessions'
import { listGoals } from './api/goals'
import { listGoalEntries } from './api/goalEntries'
import { listDailyAnswers } from './api/dailyAnswers'
import { getMoonSnapshotRange } from './api/moonSnapshots'
import { listGroups } from './api/groups'
import { listGoalCategories } from './api/goalCategories'
import { listUserQuestions } from './api/userQuestions'

/* sel = { sessions, goals, dailyAnswers, moon } booleans. gender feeds the
   daily-question text resolver. All fetches run in parallel. */
export async function loadSensitiveExportData(sel = {}, gender = 'neutral') {
  const wantGroups = !!(sel.sessions || sel.goals) // sessions + goals can be group-scoped
  const [sessions, goals, goalEntries, dailyAnswers, moonSnapshots, groups, goalCategories, questions] =
    await Promise.all([
      sel.sessions ? listSessions() : null,
      sel.goals ? listGoals() : null,
      sel.goals ? listGoalEntries() : null,
      sel.dailyAnswers ? listDailyAnswers() : null,
      sel.moon ? getMoonSnapshotRange() : null,
      wantGroups ? listGroups() : null,
      sel.goals ? listGoalCategories() : null,
      sel.dailyAnswers ? listUserQuestions() : null,
    ])

  const out = {}
  if (sessions) out.sessions = sessions
  if (goals) out.goals = goals
  if (goalEntries) out.goalEntries = goalEntries
  if (dailyAnswers) out.dailyAnswers = dailyAnswers
  if (moonSnapshots) out.moonSnapshots = moonSnapshots
  if (groups) out.groups = groups
  if (goalCategories) out.goalCategories = goalCategories
  if (questions) { out.questions = questions; out.gender = gender }
  return Object.keys(out).length ? out : null
}
