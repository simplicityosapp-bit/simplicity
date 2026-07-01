import { QueryClient } from '@tanstack/react-query'

/* Single app-wide query cache. The point of adopting React Query here is
   request DEDUPLICATION: many home widgets call the same data hook, and
   without a shared cache each one fired its own Supabase round-trip. With
   one QueryClient, identical query keys share a single in-flight request
   and a single cached result.

   Defaults tuned to mirror the app's previous behaviour:
   - staleTime 60s    → a freshly-loaded table isn't refetched when another
                        widget mounts moments later (kills the fan-out).
   - no focus refetch → the old hooks never refetched on window focus;
                        keep that so nothing changes for the user.
   - retry once       → matches the single-attempt error surface the hooks
                        already exposed via `error`. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
