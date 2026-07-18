import { useQuery } from '@tanstack/react-query'
import { listCommunityMembers } from '../lib/api/communityMessages'

/* Members for the @-mention autocomplete. One shared fetch (React Query),
   gated like the room so it doesn't load for someone being redirected out. */
export function useCommunityMembers({ enabled = true } = {}) {
  const { data } = useQuery({
    queryKey: ['communityMembers'],
    queryFn: listCommunityMembers,
    enabled,
  })
  return data ?? []
}
