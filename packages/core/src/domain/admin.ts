/* ════════════════════════════════════════════════════════════════
   WHO IS AN ADMIN — the client-side gate, shared by both apps.
   ════════════════════════════════════════════════════════════════
   The source of truth is the user's app_metadata, stamped ONLY by the
   `admin` edge function using the service_role key and never writable
   from a client. These helpers just READ what already rides inside the
   session's JWT, so they are cheap, synchronous, and tamper-proof at
   the source.

   The hardcoded super-owner (ADMIN_EMAIL) is always an admin with every
   permission, even though that account never gets metadata stamped on
   it.

   IMPORTANT: like every client gate, this is UX only. The edge function
   re-verifies exactly the same thing server-side on every request, and
   that is the real authority. Spoofing a role here buys nothing but a
   broken, empty console — every data call 403s.

   A newly-promoted user only picks up their role on the NEXT token
   refresh or sign-in, because it travels inside the JWT.

   Shared because the phone console has to gate on precisely the same
   rule as the web one. Two copies of "who may see this" is the kind of
   drift that only shows up as someone seeing a screen they should not.
   ════════════════════════════════════════════════════════════════ */

export const ADMIN_EMAIL = 'simplicity.os.app@gmail.com'

/* The three things a promoted admin can be trusted with, each granted
   individually. The owner implicitly has all of them. */
export const PERM_KEYS = ['delete_users', 'set_subscriber', 'manage_admins'] as const
export type PermKey = (typeof PERM_KEYS)[number]

export interface AdminUserLike {
  email?: string | null
  app_metadata?: {
    role?: string | null
    admin_perms?: Partial<Record<PermKey, boolean>> | null
  } | null
}

export function isOwnerUser(user?: AdminUserLike | null): boolean {
  return (user?.email || '').toLowerCase() === ADMIN_EMAIL
}

/* True for the super-owner, and for any user the owner promoted. */
export function isAdminUser(user?: AdminUserLike | null): boolean {
  return isOwnerUser(user) || user?.app_metadata?.role === 'admin'
}

/* The user's effective permissions. Owner → all true. Promoted admin →
   exactly what is stamped, with missing keys defaulting to false.
   Non-admin → all false. */
export function adminPerms(user?: AdminUserLike | null): Record<PermKey, boolean> {
  const owner = isOwnerUser(user)
  const ap = user?.app_metadata?.admin_perms || {}
  const out = {} as Record<PermKey, boolean>
  for (const k of PERM_KEYS) out[k] = owner || ap[k] === true
  return out
}
