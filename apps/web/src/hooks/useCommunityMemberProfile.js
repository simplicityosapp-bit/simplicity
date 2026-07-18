import { useQuery } from '@tanstack/react-query'
import { getCommunityProfileByUserId } from '../lib/api/communityProfiles'

/* ════════════════════════════════════════════════════════════════
   useCommunityMemberProfile — one member's full public card (0091)
   ════════════════════════════════════════════════════════════════
   The message embed carries only name + avatar + badge — the minimum to draw a
   bubble. The rest of a member's public identity (bio/headline/specialties/
   link) is fetched on demand, the moment their card opens, and cached by
   user_id: re-opening the same card is instant, and many messages from one
   author share a single fetch. RLS (0082) is what makes this cross-user read
   legal — readable within the community, always by the owner.
   ════════════════════════════════════════════════════════════════ */
export function useCommunityMemberProfile(userId, { enabled = true } = {}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['communityMemberProfile', userId],
    queryFn: () => getCommunityProfileByUserId(userId),
    enabled: enabled && !!userId,
    staleTime: 60_000,
  })
  return { profile: data ?? null, loading: isLoading, error: error?.message ?? null }
}
