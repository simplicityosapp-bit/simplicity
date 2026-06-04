import { useMemo } from 'react'
import { useUserPreferences } from './useUserPreferences'
import { useClients } from './useClients'
import { useProjects } from './useProjects'
import { useTransactions } from './useTransactions'
import { useRecurring } from './useRecurring'
import { useTasks } from './useTasks'
import { useReminders } from './useReminders'
import { useLeads } from './useLeads'
import { useGoals } from './useGoals'
import { useUserQuestions } from './useUserQuestions'
import { useDailyAnswers } from './useDailyAnswers'
import { computeProfileHealth } from '../lib/profileHealth'

/* Composes every data source the profile-health score reads and returns
   the computed result. Mount this lazily (only when the menu drawer is
   open) — several of the underlying hooks fire a fetch on mount, so we
   don't want them running on every app load. The React-Query-backed
   ones (clients/goals/tasks/…) reuse the app-wide cache when already
   loaded by another screen; the useState ones (reminders/questions/
   recurring) fetch once per open. */
export function useProfileHealth() {
  const { prefs, loading: prefsLoading } = useUserPreferences()
  const { clients, loading: lClients } = useClients()
  const { projects, loading: lProjects } = useProjects()
  const { transactions, loading: lTx } = useTransactions()
  const { templates: recurring, loading: lRecurring } = useRecurring()
  const { tasks, loading: lTasks } = useTasks()
  const { reminders, loading: lReminders } = useReminders()
  const { leads, loading: lLeads } = useLeads()
  const { goals, loading: lGoals } = useGoals()
  const { questions, loading: lQuestions } = useUserQuestions()
  const { answers, loading: lAnswers } = useDailyAnswers()

  const loading =
    prefsLoading || lClients || lProjects || lTx || lRecurring ||
    lTasks || lReminders || lLeads || lGoals || lQuestions || lAnswers

  const health = useMemo(
    () => computeProfileHealth({
      profile: prefs?.profile,
      clients, projects, transactions, recurring,
      tasks, reminders, leads, goals, questions, answers,
    }),
    [prefs?.profile, clients, projects, transactions, recurring, tasks, reminders, leads, goals, questions, answers],
  )

  return { health, loading }
}
