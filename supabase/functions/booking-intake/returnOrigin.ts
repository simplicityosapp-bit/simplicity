/* ════════════════════════════════════════════════════════════════
   Where the payment page may send the visitor back to.
   ════════════════════════════════════════════════════════════════
   The return origin arrives in the REQUEST BODY of a public, unauthenticated
   endpoint, which makes it attacker-chosen. It used to be accepted on the
   strength of `/^https?:\/\//` alone, so a crafted booking could land a payer —
   after a genuine payment on a genuine Grow page — on a site of the attacker's
   choosing, primed to ask them to "confirm their card details". The payment
   itself is unaffected; the redirect is the whole attack.

   Split out of index.ts for one reason: this is a security control, and a
   security control with no test is a hope. index.ts reads Deno.env at module
   scope and so cannot be imported by the suite; this file imports nothing and
   touches no runtime, exactly like invoices/providers.ts sits beside
   invoices/index.ts. Its tests live in apps/web/test/booking-return-origin.
   ════════════════════════════════════════════════════════════════ */

export const CANONICAL_ORIGIN = 'https://simplicity-os.com'

/* The allow-list. `extra` is BOOKING_RETURN_ORIGINS — a comma-separated list
   that adds preview/staging origins without a code change:
   `supabase secrets set BOOKING_RETURN_ORIGINS=https://…`
   Passed in rather than read here so this module stays runtime-free. */
export function allowedReturnOrigins(extra?: string | null): Set<string> {
  return new Set([
    CANONICAL_ORIGIN,
    ...(extra ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  ])
}

/* Parse, then compare the URL's own `origin`. Going through URL is what makes
   the check honest: it strips any path or query, and it resolves the userinfo
   trick — `https://simplicity-os.com@evil.test` has origin `https://evil.test`,
   which a string comparison on the raw value would have waved through. An
   exact match, never a prefix test, which `https://simplicity-os.com.evil.test`
   would satisfy.

   Anything unrecognised returns the canonical origin rather than throwing: a
   booking should still complete, it just returns to the real site. */
export function returnOrigin(raw: unknown, allowed: Set<string>): string {
  const value = (raw == null ? '' : String(raw)).trim()
  if (!value) return CANONICAL_ORIGIN
  let parsed: URL
  try { parsed = new URL(value) } catch { return CANONICAL_ORIGIN }
  if (!allowed.has(parsed.origin)) {
    console.warn('booking-intake: rejected return origin', parsed.origin)
    return CANONICAL_ORIGIN
  }
  return parsed.origin
}
