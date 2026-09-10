/* ════════════════════════════════════════════════════════════════
   WHO GETS INTO THE CONSOLE.
   ════════════════════════════════════════════════════════════════
   This gate is UX only — the `admin` edge function re-checks every
   request server-side, and that is the real authority. But it decides
   what a person is SHOWN, and both apps now ask it the same question,
   so the cases below are the ones where getting it wrong means someone
   sees a screen they should not, or an owner is locked out of their own
   console.

   The permission triple matters as much as the yes/no: a promoted admin
   is trusted with exactly what was stamped on them, and a missing key
   has to read as "no" rather than "unset".
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect } from 'vitest'
import { ADMIN_EMAIL, isOwnerUser, isAdminUser, adminPerms, PERM_KEYS } from '../src/domain/admin'

const owner = { email: ADMIN_EMAIL, app_metadata: {} }
const promoted = (perms?: Record<string, boolean>) => ({
  email: 'someone@example.com',
  app_metadata: { role: 'admin', admin_perms: perms },
})
const plain = { email: 'someone@example.com', app_metadata: {} }

describe('the owner', () => {
  it('is recognised by email', () => {
    expect(isOwnerUser(owner)).toBe(true)
    expect(isOwnerUser(plain)).toBe(false)
  })

  /* Emails arrive from the provider in whatever case the person typed.
     A capitalised sign-in that locked the owner out of their own console
     would look like a broken deploy, not a comparison. */
  it('is recognised whatever the case', () => {
    expect(isOwnerUser({ email: ADMIN_EMAIL.toUpperCase() })).toBe(true)
    expect(isOwnerUser({ email: 'Simplicity.OS.App@Gmail.com' })).toBe(true)
  })

  it('is an admin without any metadata stamped', () => {
    expect(isAdminUser(owner)).toBe(true)
  })

  it('has every permission, stamped or not', () => {
    expect(adminPerms(owner)).toEqual({ delete_users: true, set_subscriber: true, manage_admins: true })
  })

  /* The owner shortcut must not be reachable by anything a client can
     set. Only the email counts. */
  it('cannot be impersonated by claiming the role', () => {
    expect(isOwnerUser({ email: 'nobody@example.com', app_metadata: { role: 'owner' } })).toBe(false)
    expect(adminPerms({ email: 'nobody@example.com', app_metadata: { role: 'owner' } }))
      .toEqual({ delete_users: false, set_subscriber: false, manage_admins: false })
  })
})

describe('a promoted admin', () => {
  it('gets in on the stamped role', () => {
    expect(isAdminUser(promoted())).toBe(true)
    expect(isOwnerUser(promoted())).toBe(false)
  })

  it('gets exactly the permissions that were stamped', () => {
    expect(adminPerms(promoted({ delete_users: true }))).toEqual({
      delete_users: true, set_subscriber: false, manage_admins: false,
    })
  })

  /* A key that was never written must read as denied. Treating "absent"
     as anything but false is how a permission gets granted by omission. */
  it('is denied anything not stamped', () => {
    const perms = adminPerms(promoted({}))
    for (const k of PERM_KEYS) expect(perms[k]).toBe(false)
  })

  /* Only the literal `true` grants. Anything else a JSON blob might carry
     — a string, a 1, a null — is not a grant. */
  it('is not granted by a truthy value that is not true', () => {
    const perms = adminPerms(promoted({ delete_users: 'yes' as unknown as boolean }))
    expect(perms.delete_users).toBe(false)
  })
})

describe('everyone else', () => {
  it('is not an admin', () => {
    expect(isAdminUser(plain)).toBe(false)
    expect(adminPerms(plain)).toEqual({ delete_users: false, set_subscriber: false, manage_admins: false })
  })

  /* A role that merely resembles the real one grants nothing. */
  it('is not an admin for a near-miss role', () => {
    expect(isAdminUser({ email: 'x@example.com', app_metadata: { role: 'Admin' } })).toBe(false)
    expect(isAdminUser({ email: 'x@example.com', app_metadata: { role: 'administrator' } })).toBe(false)
  })

  /* Signed out, still loading, or a shape that never arrived — none of
     these may throw, and none may open the console. The console calls
     this before it knows whether a session exists. */
  it('is handled when there is no user at all', () => {
    for (const u of [null, undefined, {}, { email: null }, { app_metadata: null }]) {
      expect(isAdminUser(u as never)).toBe(false)
      expect(isOwnerUser(u as never)).toBe(false)
      expect(adminPerms(u as never)).toEqual({ delete_users: false, set_subscriber: false, manage_admins: false })
    }
  })
})

describe('adminPerms', () => {
  /* The console memoises this per user precisely because it allocates.
     If it ever returned a shared object, one screen's mutation would
     silently change another's permissions. */
  it('returns a fresh object each call', () => {
    const a = adminPerms(owner)
    const b = adminPerms(owner)
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })

  it('answers every known permission key and nothing else', () => {
    expect(Object.keys(adminPerms(plain)).sort()).toEqual([...PERM_KEYS].sort())
  })
})
