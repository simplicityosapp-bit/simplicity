import { useQuery } from '@tanstack/react-query'
import { searchCommunityMessages } from '../lib/api/communityMessages'

/* ════════════════════════════════════════════════════════════════
   useCommunitySearch — server-side results for the active term
   ════════════════════════════════════════════════════════════════
   Keyed by the term so each query caches and re-runs only on change; disabled
   until the term is meaningful (≥ 2 chars) so a lone keystroke doesn't hit the
   DB. The caller debounces before handing the term over. Newest-first, capped
   at one page — refining the term narrows, there is no second page.
   ════════════════════════════════════════════════════════════════ */
export function useCommunitySearch(term, { enabled = true } = {}) {
  const q = (term ?? '').trim()
  const active = enabled && q.length >= 2
  const { data, isLoading, error } = useQuery({
    queryKey: ['communitySearch', q],
    queryFn: () => searchCommunityMessages(q),
    enabled: active,
    staleTime: 30_000,
  })
  return { results: data ?? [], loading: active && isLoading, error: error?.message ?? null, active }
}
