/* The one reading of Supabase's auth messages both apps share. */
import { describe, it, expect } from 'vitest'
import { authErrorKey } from '../src/domain/authErrors'

describe('authErrorKey', () => {
  it.each([
    ['Invalid login credentials', 'invalidLogin'],
    ['User already registered', 'alreadyRegistered'],
    ['Password should be at least 8 characters', 'passwordTooShort'],
    ['Email not confirmed', 'emailNotConfirmed'],
    ['Unable to validate email address: invalid format', 'invalidEmail'],
    ['Email rate limit exceeded', 'rateLimit'],
    ['For security purposes, you can only request this after 51 seconds', 'rateLimit'],
    ['Unsupported provider: provider is not enabled', 'providerDisabled'],
    ['New password should be different from the old password.', 'samePassword'],
    ['Auth session missing!', 'sessionExpired'],
  ])('reads "%s" as %s', (msg, key) => {
    expect(authErrorKey(msg)).toBe(key)
  })

  it('falls back to generic for anything else, including nothing', () => {
    expect(authErrorKey('socket hang up')).toBe('generic')
    expect(authErrorKey(undefined)).toBe('generic')
    expect(authErrorKey(null)).toBe('generic')
  })
})
