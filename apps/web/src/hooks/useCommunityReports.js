import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listCommunityReports, dismissReportsForMessage } from '../lib/api/communityReports'

/* The admin moderation queue. Only fetched when `enabled` (admin + gate open),
   since RLS returns nothing to non-admins anyway. Reports are grouped by message
   at the call site. */
const KEY = ['communityReports']

export function useCommunityReports({ enabled = true } = {}) {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: KEY, queryFn: listCommunityReports, enabled })
  const reports = data ?? []

  /* Clear all reports on a message (resolve). Optimistic; refetch on failure. */
  const dismiss = useCallback(async (messageId) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((r) => r.message_id !== messageId))
    try { await dismissReportsForMessage(messageId) } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { reports, dismiss }
}
