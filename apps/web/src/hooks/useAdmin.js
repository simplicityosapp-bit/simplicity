import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { isAdminUser } from '../lib/admin'

/* ════════════════════════════════════════════════════════════════
   useAdmin — thin client over the `admin` edge function.
   ════════════════════════════════════════════════════════════════
   Every call hits one server-side function that re-verifies the caller
   is an admin (RLS can't see other users from the browser, so this is
   the ONLY way the console gets cross-user data). We never query tables
   directly here.

   - callAdmin(action, params) → resolves the function's JSON `data`,
     or throws on a non-2xx / { error } payload.
   - useAdminQuery(action, params) → React Query read with loading/error
     + refetch(). Same return shape the screens always used.
   - useAdminCache() → write-through helpers so an optimistic edit also
     lands in the cache (see WHY CACHED below).

   WHY CACHED (2026-07-27): this used to be a bespoke useState/useEffect
   fetcher with no cache at all, so every mount — including flipping
   between the four console tabs and back — replayed a full ~0.6-1.6s
   edge round-trip behind a blank "loading" state. The rest of the app
   has been on React Query for months; the console was the last hold-out.

   SECURITY — two properties this hook must keep:
    1. The cache key is scoped to the signed-in user id, and AuthProvider
       already calls queryClient.clear() whenever the identity changes.
       Belt AND braces: user B can never read a key user A wrote.
    2. `enabled` gates on isAdminUser, so mounting a console screen
       outside the /admin route gate fires no request at all. The edge
       function re-verifies server-side regardless — that is still the
       real authority, and none of this weakens it.
   ════════════════════════════════════════════════════════════════ */

export async function callAdmin(action, params = {}) {
  const { data, error } = await supabase.functions.invoke('admin', {
    body: { action, ...params },
  })
  if (error) throw error
  if (data && data.error) throw new Error(data.error)
  return data
}

/* Cache key for one console read. Scoped by user id (see SECURITY above);
   `params` is serialised so a fresh object literal each render is stable. */
const adminKey = (userId, action, params) => ['admin', userId, action, JSON.stringify(params ?? {})]

export function useAdminQuery(action, params = {}) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const allowed = isAdminUser(user)
  const key = JSON.stringify(params)

  const { data, isPending, error, refetch } = useQuery({
    queryKey: adminKey(userId, action, params),
    queryFn: () => callAdmin(action, JSON.parse(key)),
    enabled: allowed,
    // Console figures are stats, not live dashboards: a minute of staleness
    // is invisible, and it's what makes tab-switching instant.
    staleTime: 60_000,
    /* Always attempt, and always settle. Under the default networkMode
       ('online') React Query PAUSES a query it believes can't reach the
       network — it stays `pending` with fetchStatus 'paused', so the screen
       sits on "טוען…" forever with no error and no way out. Observed here
       against a 500ing action with navigator.onLine === true. The hook this
       replaced always fired and always surfaced the failure; keep that, since
       a stuck spinner is the worst outcome for an admin screen. */
    networkMode: 'always',
  })

  const doRefetch = useCallback(async () => { await refetch() }, [refetch])

  return {
    data: data ?? null,
    // A disabled query is pending forever; a non-admin should see "no data",
    // never a spinner that never resolves.
    loading: allowed && isPending,
    error: error ?? null,
    refetch: doRefetch,
  }
}

/* Write-through helpers for the console's optimistic edits.

   The screens keep their own optimistic state for instant feedback +
   rollback, but that state dies with the component. Without a matching
   cache write, remounting a tab within the staleTime window would render
   the pre-edit payload — a regression the old no-cache hook couldn't have.
   `patch` mutates the cached payload in place of a refetch, so a triage
   click stays as cheap as it was before. */
export function useAdminCache() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const userId = user?.id ?? null

  return useMemo(() => ({
    /* Replace the cached payload for one action via `updater(prev)`. */
    patch: (action, updater, params = {}) => {
      queryClient.setQueryData(adminKey(userId, action, params), (prev) => (
        prev ? updater(prev) : prev
      ))
    },
    /* Drop every cached console read — for changes too broad to patch
       (deleting a user cascades into every counter on every tab). */
    invalidate: () => queryClient.invalidateQueries({ queryKey: ['admin', userId] }),
  }), [queryClient, userId])
}
