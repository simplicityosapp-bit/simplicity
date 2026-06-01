import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listClients, insertClient, updateClient as apiUpdateClient, removeClient as apiRemoveClient } from '../lib/api/clients'

/* Loads the signed-in user's clients and exposes CRUD. Backed by React
   Query so every component that calls useClients() shares ONE cached
   fetch instead of each firing its own (the home screen mounted this
   hook 6×). Public API is unchanged. Mutations update the cache
   optimistically and invalidate on error to resync. */
const KEY = ['clients']

export function useClients() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listClients })
  const clients = data ?? []

  const addClient = useCallback(async (payload) => {
    const row = await insertClient(payload)
    qc.setQueryData(KEY, (prev) => [row, ...(prev ?? [])])
    return row
  }, [qc])

  const updateClient = useCallback(async (id, patch) => {
    const row = await apiUpdateClient(id, patch)
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((c) => (c.id === id ? row : c)))
    return row
  }, [qc])

  const removeClient = useCallback(async (id) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((c) => c.id !== id)) // optimistic
    try {
      await apiRemoveClient(id)
    } catch {
      qc.invalidateQueries({ queryKey: KEY }) // resync
    }
  }, [qc])

  return { clients, loading: isLoading, error: error?.message ?? null, addClient, updateClient, removeClient, refetch }
}
