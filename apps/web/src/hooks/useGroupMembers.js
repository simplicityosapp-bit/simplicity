import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listGroupMembers, insertGroupMember, updateGroupMember as apiUpdate, removeGroupMember as apiRemove } from '../lib/api/groupMembers'

/* React-Query-backed: home mounts this in BOTH AttentionWidget and MoonWidget,
   and the clients screen reads it per card — one shared cache instead of a
   fetch per consumer. Public API unchanged. */
const KEY = ['groupMembers']

export function useGroupMembers() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listGroupMembers })
  const members = data ?? []

  const addMember = useCallback(async (payload) => {
    const row = await insertGroupMember(payload)
    qc.setQueryData(KEY, (prev) => [row, ...(prev ?? [])])
    return row
  }, [qc])

  const removeMember = useCallback(async (id) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((m) => m.id !== id))
    try { await apiRemove(id) } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  /* Optimistic patch — used for per-member billing override (total_override). */
  const updateMember = useCallback(async (id, patch) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)))
    try { await apiUpdate(id, patch) } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { members, loading: isLoading, error: error?.message ?? null, addMember, updateMember, removeMember, refetch }
}
