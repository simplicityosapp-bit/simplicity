import { useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { listCommunityNotifications, markNotificationsRead } from '../lib/api/communityNotifications'

/* ════════════════════════════════════════════════════════════════
   useCommunityNotifications — the member's in-app inbox + live unread badge.
   ════════════════════════════════════════════════════════════════
   Realtime re-checks the SELECT policy per subscriber, so a member's channel
   only ever delivers their OWN rows. Any change (a new mention, a mark-read
   from another tab) invalidates the query — the list is small and the refetch
   is cheap, so a targeted cache patch isn't worth the complexity here.
   ════════════════════════════════════════════════════════════════ */
const KEY = ['communityNotifications']

export function useCommunityNotifications({ enabled = true } = {}) {
  const qc = useQueryClient()
  const { data, refetch } = useQuery({ queryKey: KEY, queryFn: listCommunityNotifications, enabled })
  const notifications = data ?? []
  const unreadCount = notifications.reduce((n, x) => (x.read_at ? n : n + 1), 0)

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    const channel = supabase
      .channel('community_notifications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'community_notifications' },
        () => { if (!cancelled) qc.invalidateQueries({ queryKey: KEY }) },
      )
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [enabled, qc])

  const markAllRead = useCallback(async () => {
    if (!(qc.getQueryData(KEY) ?? []).some((n) => !n.read_at)) return
    const now = new Date().toISOString()
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((n) => (n.read_at ? n : { ...n, read_at: now })))
    try { await markNotificationsRead() } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { notifications, unreadCount, markAllRead, refetch }
}
