/* ════════════════════════════════════════════════════════════════
   AUTH ERROR KINDS — the classifier that decides which way out a failed
   sign-in is offered.

   The sentence shown to the person was always translated from these same
   matches; what is new is that two screens now act on the KIND. "Wrong email
   or password" puts a link to the reset flow inside the message, and "email
   not confirmed" offers to send the confirmation mail again — the case that
   had no way out at all until now (2 of the 46 accounts on the live project
   have never confirmed).

   So a wrong answer here is not a clumsy sentence any more, it is the wrong
   door: offering to resend a confirmation to someone who simply mistyped
   their password, or offering a password reset to someone whose password is
   fine and whose mail is sitting unopened.
   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { authErrorKey } from '../src/auth/authErrors'

describe('auth error kinds', () => {
  it('reads a wrong password as one — the reset link hangs off this', () => {
    expect(authErrorKey('Invalid login credentials')).toBe('invalidLogin')
  })

  it('reads an unconfirmed address as one — the resend button hangs off this', () => {
    expect(authErrorKey('Email not confirmed')).toBe('emailNotConfirmed')
  })

  it('knows the three shapes Supabase uses for an address already taken', () => {
    for (const msg of [
      'User already registered',
      'A user with this email address has already been registered',
      'User already exists',
    ]) expect(authErrorKey(msg)).toBe('alreadyRegistered')
  })

  it('is case-insensitive — the wording arrives capitalised', () => {
    expect(authErrorKey('INVALID LOGIN CREDENTIALS')).toBe('invalidLogin')
    expect(authErrorKey('email not confirmed')).toBe('emailNotConfirmed')
  })

  it('reads all three wordings for being asked to slow down', () => {
    expect(authErrorKey('email rate limit exceeded')).toBe('rateLimit')
    expect(authErrorKey('Too many requests')).toBe('rateLimit')
    /* The one the resend button actually meets, and the one that used to fall
       through to "something went wrong" for a system working as intended. */
    expect(authErrorKey('For security purposes, you can only request this after 51 seconds'))
      .toBe('rateLimit')
  })

  it('falls back to generic rather than guessing a door', () => {
    expect(authErrorKey('Database connection lost')).toBe('generic')
    expect(authErrorKey('')).toBe('generic')
    expect(authErrorKey()).toBe('generic')
  })

  it('does not mistake a reset-flow message for a sign-in one', () => {
    expect(authErrorKey('New password should be different from the old password')).toBe('samePassword')
    expect(authErrorKey('Auth session missing!')).toBe('sessionExpired')
  })
})
