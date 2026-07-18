import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getMyCommunityProfile, insertCommunityProfile, updateCommunityProfile } from '../lib/api/communityProfiles'

/* ════════════════════════════════════════════════════════════════
   useCommunityProfile — "does this user have a community profile yet?"
   ════════════════════════════════════════════════════════════════
   The repo's existing answer to the one-row-per-user question is
   useSubscription, and this mirrors it: a single React Query fetch shared by
   every mount, and a MISSING row treated as a normal state rather than an
   error. Here that missing row is the whole point — it is what the profile
   gate keys off, and what the community_messages FK (0086) enforces.

   ⚠️  `hasProfile` is only meaningful once `loading` is false. Before the
   fetch resolves, "no profile" and "not loaded yet" are the same shape, so a
   gate that redirects on !hasProfile without waiting would bounce a user who
   already has one. The next sub-task wires that redirect — this is the check
   it should read.
   ════════════════════════════════════════════════════════════════ */
const KEY = ['communityProfile']

export function useCommunityProfile() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: getMyCommunityProfile })
  const profile = data ?? null

  /* Seeds the cache from the inserted row rather than refetching: the row we
     get back IS the query's shape, so the gate flips without a second trip. */
  const createProfile = useCallback(async (payload) => {
    const row = await insertCommunityProfile(payload)
    qc.setQueryData(KEY, row)
    return row
  }, [qc])

  /* Same cache-seed as create: the updated row IS the query's shape, so the
     screen reflects the edit without a refetch. */
  const updateProfile = useCallback(async (payload) => {
    const row = await updateCommunityProfile(payload)
    qc.setQueryData(KEY, row)
    return row
  }, [qc])

  return {
    profile,
    hasProfile: !!profile,
    loading: isLoading,
    error: error?.message ?? null,
    createProfile,
    updateProfile,
    refetch,
  }
}
