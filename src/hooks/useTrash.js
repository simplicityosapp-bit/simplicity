import { useCallback, useEffect, useState } from 'react'
import { listDeletedClients, restoreClient } from '../lib/api/clients'
import { listDeletedProjects, restoreProject } from '../lib/api/projects'
import { listDeletedTasks, restoreTask } from '../lib/api/tasks'
import { listDeletedLeads, restoreLead } from '../lib/api/leads'
import { listDeletedTransactions, restoreTransaction } from '../lib/api/transactions'
import { listDeletedSessions, restoreSession } from '../lib/api/sessions'

/* Entity types covered by the v1 trash pilot. Add new keys here when
   we expand to the remaining soft-delete entities (recurring,
   categories, goals, etc.). Order is the display order on the screen. */
export const TRASH_ENTITY_TYPES = ['clients', 'projects', 'tasks', 'leads', 'transactions', 'sessions']

const EMPTY = Object.fromEntries(TRASH_ENTITY_TYPES.map((k) => [k, []]))

const LISTERS = {
  clients: listDeletedClients,
  projects: listDeletedProjects,
  tasks: listDeletedTasks,
  leads: listDeletedLeads,
  transactions: listDeletedTransactions,
  sessions: listDeletedSessions,
}

const RESTORERS = {
  clients: restoreClient,
  projects: restoreProject,
  tasks: restoreTask,
  leads: restoreLead,
  transactions: restoreTransaction,
  sessions: restoreSession,
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
    try {
      const results = await Promise.all(TRASH_ENTITY_TYPES.map((k) => LISTERS[k]()))
      const next = {}
      TRASH_ENTITY_TYPES.forEach((k, i) => { next[k] = results[i] || [] })
      setTrash(next)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const results = await Promise.all(TRASH_ENTITY_TYPES.map((k) => LISTERS[k]()))
        if (!active) return
        const next = {}
        TRASH_ENTITY_TYPES.forEach((k, i) => { next[k] = results[i] || [] })
        setTrash(next)
        setError(null)
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
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
