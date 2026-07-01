import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { effectiveTier, isBetaExempt, capabilities, clientLimit, goalLimit, projectLimit, pageLimit } from '../lib/subscription'

/* ════════════════════════════════════════════════════════════════
   useSubscription — the current user's plan + what it unlocks.
   ════════════════════════════════════════════════════════════════
   Reads the user's own user_subscriptions row (RLS: select-own). The
   row is service-role-write-only, so the client only ever reads it.
   A missing row ⇒ free (the correct default for new users). Fetched
   ONCE via React Query and shared across every mount (mirrors
   useInvoiceProvider). Capability flags + limits are derived from the
   effective tier through src/lib/subscription.js, so while
   BILLING_ENABLED is false everything reads as unlocked / unlimited. */
const KEY = ['subscription']

export function useSubscription() {
  const { data: sub = null, isLoading: loading, error } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return null
      const { data, error: qErr } = await supabase
        .from('user_subscriptions')
        .select('tier, status, beta_exempt_until, current_period_end, subscribed_at, locked_price')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (qErr) throw qErr
      return data
    },
  })

  const tier = effectiveTier(sub)
  return {
    sub,
    tier,
    loading,
    error: error?.message ?? null,
    betaExempt: isBetaExempt(sub),
    can: capabilities(tier),
    limits: {
      clients: clientLimit(tier),
      goals: goalLimit(tier),
      projects: projectLimit(tier),
      landingPages: pageLimit(tier, 'landing'),
      leadPages: pageLimit(tier, 'lead'),
      bookingPages: pageLimit(tier, 'booking'),
    },
  }
}
