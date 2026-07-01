import { ADMIN_EMAIL } from './routes'

/* ════════════════════════════════════════════════════════════════
   admin — pure client-side helpers for "who is an admin".
   ════════════════════════════════════════════════════════════════
   Source of truth lives on the user's app_metadata, set ONLY by the
   `admin` edge function with the service_role key — never writable from
   the browser. These helpers just READ what's already in the session's
   JWT, so they're cheap, synchronous, and tamper-proof at the source.

   The hardcoded super-owner (ADMIN_EMAIL) is always an admin with every
   permission, even though we never stamp metadata on that account.

   IMPORTANT: like every client gate, this is UX only. The edge function
   re-verifies the exact same thing server-side on every request — that
   is the real authority. A spoofed role here buys nothing but a broken,
   empty console (every data call 403s).

   A newly-promoted user only picks up their role on the NEXT token
   refresh / sign-in, since it rides inside the JWT.
   ════════════════════════════════════════════════════════════════ */

const PERM_KEYS = ['delete_users', 'set_subscriber', 'manage_admins']

export function isOwnerUser(user) {
  return (user?.email || '').toLowerCase() === ADMIN_EMAIL
}

/* True for the super-owner and for any user the owner promoted. */
export function isAdminUser(user) {
  return isOwnerUser(user) || user?.app_metadata?.role === 'admin'
}

/* The user's effective permissions. Owner → all true. Promoted admin →
   exactly what's stamped (missing keys default false). Non-admin → all false. */
export function adminPerms(user) {
  const owner = isOwnerUser(user)
  const ap = user?.app_metadata?.admin_perms || {}
  const out = {}
  for (const k of PERM_KEYS) out[k] = owner || ap[k] === true
  return out
}
