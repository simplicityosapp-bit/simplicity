import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listScheduledMeetings, insertScheduledMeeting,
  updateScheduledMeeting as apiUpdate,
  removeScheduledMeeting as apiRemove,
} from '../lib/api/scheduledMeetings'
import { pushUndo } from '../lib/undo'

/* React-Query-backed: attention + meeting-confirm + quick-row widgets
   shared this fetch. Public API unchanged. */
const KEY = ['scheduledMeetings']
const byTime = (a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)

export function useScheduledMeetings() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listScheduledMeetings })
  const meetings = data ?? []

  const addMeeting = useCallback(async (payload) => {
    const row = await insertScheduledMeeting(payload)
    qc.setQueryData(KEY, (prev) => [...(prev ?? []), row].sort(byTime))
    return row
  }, [qc])

  const updateMeeting = useCallback(async (id, patch) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m))) // optimistic
    try {
      const row = await apiUpdate(id, patch)
      qc.setQueryData(KEY, (prev) => (prev ?? []).map((m) => (m.id === id ? row : m)))
      return row
    } catch (e) {
      qc.invalidateQueries({ queryKey: KEY })
      throw e
    }
  }, [qc])

  /* scheduled_meetings is a HARD delete (no deleted_at column), so undo
     re-INSERTS the captured row — which gets a fresh id. We track that
     new id so redo deletes the right row. No FK references a meeting id,
     and the (user, subject, at) slot frees up on delete, so re-insert is
     safe. */
  const removeMeeting = useCallback(async (id) => {
    const row = (qc.getQueryData(KEY) ?? []).find((m) => m.id === id)
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((m) => m.id !== id))
    try {
      await apiRemove(id)
      if (row) {
        let liveId = id
        pushUndo({
          label: 'הפגישה נמחקה',
          undo: async () => {
            const reinserted = await insertScheduledMeeting(row)
            liveId = reinserted.id
            qc.setQueryData(KEY, (prev) => [...(prev ?? []).filter((m) => m.id !== reinserted.id), reinserted].sort(byTime))
          },
          redo: async () => {
            const target = liveId
            qc.setQueryData(KEY, (prev) => (prev ?? []).filter((m) => m.id !== target))
            try { await apiRemove(target) } catch { qc.invalidateQueries({ queryKey: KEY }) }
          },
        })
      }
    } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { meetings, loading: isLoading, error: error?.message ?? null, addMeeting, updateMeeting, removeMeeting, refetch }
}
