/* ════════════════════════════════════════════════════════════════
   ADMIN-ACCESS SUITE — guards the client-side gate that decides who may
   open the /admin console. This is LEGALLY sensitive: the console shows
   every user's data, so a regular user must NEVER be classified as admin.
   The edge function re-verifies the same thing server-side (the real
   authority), but this nets any regression in the client gate.
   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { isAdminUser, isOwnerUser, adminPerms } from '../src/lib/admin'
import { ADMIN_EMAIL } from '../src/lib/routes'

const OWNER = { id: 'owner', email: ADMIN_EMAIL, app_metadata: { provider: 'google' } }
const REGULAR = { id: 'u1', email: 'jane@example.com', app_metadata: { provider: 'email', providers: ['email'] } }
const PROMOTED = {
  id: 'u2', email: 'lead@example.com',
  app_metadata: { provider: 'email', role: 'admin', admin_perms: { delete_users: true, set_subscriber: false, manage_admins: false } },
}

describe('isOwnerUser', () => {
  it('matches the hardcoded owner email (case-insensitive)', () => {
    expect(isOwnerUser(OWNER)).toBe(true)
    expect(isOwnerUser({ ...OWNER, email: ADMIN_EMAIL.toUpperCase() })).toBe(true)
  })
  it('rejects everyone else', () => {
    expect(isOwnerUser(REGULAR)).toBe(false)
    expect(isOwnerUser(PROMOTED)).toBe(false)
    expect(isOwnerUser(null)).toBe(false)
    expect(isOwnerUser(undefined)).toBe(false)
    expect(isOwnerUser({})).toBe(false)
  })
})

describe('isAdminUser — only owner or a server-promoted admin', () => {
  it('admits the owner', () => {
    expect(isAdminUser(OWNER)).toBe(true)
  })
  it('admits a user promoted via app_metadata.role', () => {
    expect(isAdminUser(PROMOTED)).toBe(true)
  })
  it('REJECTS a regular user', () => {
    expect(isAdminUser(REGULAR)).toBe(false)
  })
  it('REJECTS null / undefined / empty session', () => {
    expect(isAdminUser(null)).toBe(false)
    expect(isAdminUser(undefined)).toBe(false)
    expect(isAdminUser({})).toBe(false)
  })
  it('REJECTS a forged role in user_metadata (only app_metadata counts)', () => {
    // user_metadata IS writable from the browser; app_metadata is NOT.
    // A malicious user setting their own user_metadata.role must not get in.
    const forged = { id: 'evil', email: 'evil@example.com', user_metadata: { role: 'admin' }, app_metadata: { provider: 'email' } }
    expect(isAdminUser(forged)).toBe(false)
  })
  it('REJECTS a non-admin role value in app_metadata', () => {
    const other = { id: 'u3', email: 'x@example.com', app_metadata: { role: 'editor' } }
    expect(isAdminUser(other)).toBe(false)
  })
})

describe('adminPerms — effective permissions', () => {
  it('owner implicitly has every permission', () => {
    expect(adminPerms(OWNER)).toEqual({ delete_users: true, set_subscriber: true, manage_admins: true })
  })
  it('promoted admin gets exactly what is stamped', () => {
    expect(adminPerms(PROMOTED)).toEqual({ delete_users: true, set_subscriber: false, manage_admins: false })
  })
  it('regular user has no permissions at all', () => {
    expect(adminPerms(REGULAR)).toEqual({ delete_users: false, set_subscriber: false, manage_admins: false })
  })
  it('null / empty session has no permissions', () => {
    expect(adminPerms(null)).toEqual({ delete_users: false, set_subscriber: false, manage_admins: false })
    expect(adminPerms({})).toEqual({ delete_users: false, set_subscriber: false, manage_admins: false })
  })
  it('missing perm keys default to false (never truthy by accident)', () => {
    const partial = { id: 'u4', email: 'p@example.com', app_metadata: { role: 'admin', admin_perms: { delete_users: true } } }
    expect(adminPerms(partial)).toEqual({ delete_users: true, set_subscriber: false, manage_admins: false })
  })
  it('non-boolean perm values are not treated as granted', () => {
    const sneaky = { id: 'u5', email: 's@example.com', app_metadata: { role: 'admin', admin_perms: { delete_users: 'yes', set_subscriber: 1 } } }
    expect(adminPerms(sneaky)).toEqual({ delete_users: false, set_subscriber: false, manage_admins: false })
  })
})
