import { useCallback, useEffect, useState } from 'react'
import { listDeletedClients, restoreClient } from '../lib/api/clients'
import { listDeletedProjects, restoreProject } from '../lib/api/projects'
import { listDeletedGroups, restoreGroup } from '../lib/api/groups'
import { listDeletedTasks, restoreTask } from '../lib/api/tasks'
import { listDeletedLeads, restoreLead } from '../lib/api/leads'
import { listDeletedLeadSources, restoreLeadSource } from '../lib/api/leadSources'
import { listDeletedLeadStatuses, restoreLeadStatus } from '../lib/api/leadStatuses'
import { listDeletedTransactions, restoreTransaction } from '../lib/api/transactions'
import { listDeletedCategories, restoreCategory } from '../lib/api/categories'
import { listDeletedSessions, restoreSession } from '../lib/api/sessions'
import { listDeletedRecurring, restoreRecurring } from '../lib/api/recurring'
import { listDeletedReminders, restoreReminder } from '../lib/api/reminders'
import { listDeletedGoals, restoreGoal } from '../lib/api/goals'
import { listDeletedGoalCategories, restoreGoalCategory } from '../lib/api/goalCategories'
import { listDeletedGoalEntries, restoreGoalEntry } from '../lib/api/goalEntries'
import { listDeletedUserQuestions, restoreUserQuestion } from '../lib/api/userQuestions'
import { listDeletedDailyAnswers, restoreDailyAnswer } from '../lib/api/dailyAnswers'

/* Entity types covered by the trash drawer. Order is the display
   order on the screen. group_members is intentionally excluded
   (relation table, restored via its parent). The 4 entities without
   React adapters yet — recurring, categories, sessionAttachments,
   clientNotes — will be added when those entity flows are built. */
export const TRASH_ENTITY_TYPES = [
  'clients',
  'projects',
  'groups',
  'tasks',
  'leads',
  'leadSources',
  'leadStatuses',
  'transactions',
  'categories',
  'recurring',
  'sessions',
  'reminders',
  'goals',
  'goalCategories',
  'goalEntries',
  'userQuestions',
  'dailyAnswers',
]

const EMPTY = Object.fromEntries(TRASH_ENTITY_TYPES.map((k) => [k, []]))

/* Build the trash map from allSettled results: keep every entity that loaded,
   blank the ones that failed, and surface the first failure — so one broken
   lister can't blank the entire drawer (Promise.all used to reject the lot). */
function settleTrash(results) {
  const next = {}
  let firstErr = null
  TRASH_ENTITY_TYPES.forEach((k, i) => {
    const r = results[i]
    if (r.status === 'fulfilled') next[k] = r.value || []
    else { next[k] = []; firstErr = firstErr || (r.reason?.message ?? 'load failed') }
  })
  return { next, firstErr }
}

const LISTERS = {
  clients: listDeletedClients,
  projects: listDeletedProjects,
  groups: listDeletedGroups,
  tasks: listDeletedTasks,
  leads: listDeletedLeads,
  leadSources: listDeletedLeadSources,
  leadStatuses: listDeletedLeadStatuses,
  transactions: listDeletedTransactions,
  categories: listDeletedCategories,
  recurring: listDeletedRecurring,
  sessions: listDeletedSessions,
  reminders: listDeletedReminders,
  goals: listDeletedGoals,
  goalCategories: listDeletedGoalCategories,
  goalEntries: listDeletedGoalEntries,
  userQuestions: listDeletedUserQuestions,
  dailyAnswers: listDeletedDailyAnswers,
}

const RESTORERS = {
  clients: restoreClient,
  projects: restoreProject,
  groups: restoreGroup,
  tasks: restoreTask,
  leads: restoreLead,
  leadSources: restoreLeadSource,
  leadStatuses: restoreLeadStatus,
  transactions: restoreTransaction,
  categories: restoreCategory,
  recurring: restoreRecurring,
  sessions: restoreSession,
  reminders: restoreReminder,
  goals: restoreGoal,
  goalCategories: restoreGoalCategory,
  goalEntries: restoreGoalEntry,
  userQuestions: restoreUserQuestion,
  dailyAnswers: restoreDailyAnswer,
}

/* Loads deleted-but-recoverable rows from every entity in parallel,
   keyed by entity type. The 30-day filter happens server-side in each
   listDeleted* adapter — older rows stay invisible until purge. */
export function useTrash() {
  const [trash, setTrash] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const results = await Promise.allSettled(TRASH_ENTITY_TYPES.map((k) => LISTERS[k]()))
    const { next, firstErr } = settleTrash(results)
    setTrash(next)
    setError(firstErr)
    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      const results = await Promise.allSettled(TRASH_ENTITY_TYPES.map((k) => LISTERS[k]()))
      if (!active) return
      const { next, firstErr } = settleTrash(results)
      setTrash(next)
      setError(firstErr)
      setLoading(false)
    })()
    return () => { active = false }
  }, [])

  /* Optimistic restore: pull the row out of the trash list immediately
     so the UI feels responsive, then call the server. If it fails,
     refetch to reconcile. */
  const restore = useCallback(async (entityType, id) => {
    const fn = RESTORERS[entityType]
    if (!fn) throw new Error('Unknown entity type: ' + entityType)
    setTrash((prev) => ({
      ...prev,
      [entityType]: prev[entityType].filter((r) => r.id !== id),
    }))
    try {
      await fn(id)
    } catch (e) {
      setError(e.message)
      refetch()
      throw e
    }
  }, [refetch])

  const totalCount = TRASH_ENTITY_TYPES.reduce((n, k) => n + trash[k].length, 0)

  return { trash, totalCount, loading, error, restore, refetch }
}
