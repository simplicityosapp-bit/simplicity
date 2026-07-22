/* ════════════════════════════════════════════════════════════════
   subscription — tiers, prices, limits, and capability gates.
   ════════════════════════════════════════════════════════════════
   Pure client-side helpers (mirror apps/web/src/lib/admin.js). The source of
   truth is the user_subscriptions row, read via useSubscription().
   These helpers just turn a tier into "what can this user do".

   ⚠️  MASTER SWITCH — BILLING_ENABLED.
   While it's `false` the whole tier system is INERT: every capability
   gate returns true and every limit is Infinity, so all users keep full
   access. The matching DB switch is billing_enforced() in migration
   0075 (also off). To go live: flip BOTH to true (and run the one-line
   migration that redefines billing_enforced()). Mirrors GROW_ENABLED.
   Requiring TWO independent switches (this flag + the SQL function) is a
   deliberate double-safety against accidental activation.

   ⚠️  ACTIVATION ORDER — do NOT enable enforcement until a working
   UPGRADE / PAYMENT path exists. Today the upgrade CTA is a "coming
   soon" stub (Stripe deferred), so flipping these on now would trap a
   user who hits a limit with no way to pay. Sequence: ship Stripe
   checkout → then flip the switches.
   ════════════════════════════════════════════════════════════════ */

interface TierLimits {
  clients: number
  goals: number
  projects: number
  landingPages: number
  leadPages: number
  bookingPages: number
}

interface Subscription {
  tier?: string | null
  beta_exempt_until?: string | null
}

export const BILLING_ENABLED = false

export const TIERS = { FREE: 'free', BASIC: 'basic', PREMIUM: 'premium' } as const

/* Monthly price in ILS (₪), for the plan cards. */
export const PRICES: Record<string, number> = { free: 0, basic: 42, premium: 89 }

/* Hosted Grow (גרו) payment page for the paid plan — a plain external URL the
   purchase CTA opens in a new tab. Deliberately NOT part of the Grow gateway
   integration: it uses no API and is unaffected by GROW_ENABLED / BILLING_ENABLED.
   One shared link for every user, no per-user parameters — so a completed payment
   does NOT update the user's tier. Reconciliation is manual until the real
   checkout + webhook lands (see the ACTIVATION ORDER note above). */
export const CHECKOUT_URL = 'https://pay.grow.link/MTAzNDg4~30bab0f87400c3ddf6734b1e66983826-MzczMjYwMg'

/* Free-tier ceilings. `clients` counts ALL non-deleted clients in the system
   (not just active ones). Free also gets ONE of each builder page kind
   (landing / lead / booking). Paid tiers are unlimited. */
export const LIMITS: Record<string, TierLimits> = {
  free:    { clients: 10,       goals: 3,        projects: 2,        landingPages: 1,        leadPages: 1,        bookingPages: 1 },
  basic:   { clients: Infinity, goals: Infinity, projects: Infinity, landingPages: Infinity, leadPages: Infinity, bookingPages: Infinity },
  premium: { clients: Infinity, goals: Infinity, projects: Infinity, landingPages: Infinity, leadPages: Infinity, bookingPages: Infinity },
}

/* Map a builder page kind to its LIMITS key. */
const PAGE_LIMIT_KEY: Record<string, keyof TierLimits> = { landing: 'landingPages', lead: 'leadPages', booking: 'bookingPages' }

/* Effective tier from a subscription row: an active beta exemption ⇒ premium;
   a missing row ⇒ free. MUST stay in lockstep with current_tier() in the
   migration so the UI never disagrees with what RLS would enforce. */
export function effectiveTier(sub: Subscription | null | undefined): string {
  if (!sub) return TIERS.FREE
  if (sub.beta_exempt_until && new Date(sub.beta_exempt_until) > new Date()) return TIERS.PREMIUM
  return sub.tier || TIERS.FREE
}

/* True when the user currently holds an active beta exemption (drives the
   "beta access until <date>" line in the plan UI). */
export function isBetaExempt(sub: Subscription | null | undefined): boolean {
  return !!(sub?.beta_exempt_until && new Date(sub.beta_exempt_until) > new Date())
}

/* While billing isn't enforced, every gate is open and every limit is ∞. */
const open = (): boolean => !BILLING_ENABLED

export function canConnectInvoicing(tier: string): boolean { return open() || tier !== TIERS.FREE }
export function canConnectGrow(tier: string): boolean      { return open() || tier !== TIERS.FREE }
export function canUseAI(tier: string): boolean            { return open() || tier === TIERS.PREMIUM }

export function clientLimit(tier: string): number  { return open() ? Infinity : (LIMITS[tier]?.clients ?? Infinity) }
export function goalLimit(tier: string): number    { return open() ? Infinity : (LIMITS[tier]?.goals ?? Infinity) }
export function projectLimit(tier: string): number { return open() ? Infinity : (LIMITS[tier]?.projects ?? Infinity) }
/* Per-kind builder-page ceiling (landing / lead / booking). Free = 1 of each. */
export function pageLimit(tier: string, kind: string): number {
  if (open()) return Infinity
  return LIMITS[tier]?.[PAGE_LIMIT_KEY[kind]] ?? Infinity
}

/* All capability flags for a tier, bundled (consumed by useSubscription). */
export function capabilities(tier: string): { connectInvoicing: boolean; connectGrow: boolean; useAI: boolean } {
  return {
    connectInvoicing: canConnectInvoicing(tier),
    connectGrow: canConnectGrow(tier),
    useAI: canUseAI(tier),
  }
}
