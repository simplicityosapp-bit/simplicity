/* ════════════════════════════════════════════════════════════════
   PASSWORD GATE — the rule the phone did not have.
   ════════════════════════════════════════════════════════════════
   This lived in apps/web only, so the browser refused `password` and the
   phone accepted it. Two answers for one account, and the weaker one
   decided, because it is the one that creates the account. The rule moved
   here so both apps ask the same question; these tests are what keeps the
   answer from drifting again.

   The interesting cases are not the obvious rejections — they are the
   trailing-digit strip, which has to catch `password123` without
   rejecting an ordinary passphrase that happens to end in a year.
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect } from 'vitest'
import { checkPasswordStrength, MIN_PASSWORD_LENGTH } from '../src/domain/passwordStrength'

describe('checkPasswordStrength', () => {
  it('accepts an ordinary password', () => {
    expect(checkPasswordStrength('correct-horse-99')).toBeNull()
  })

  it('rejects anything under the minimum, including nothing at all', () => {
    expect(checkPasswordStrength('short12')).toBe('tooShort')
    expect(checkPasswordStrength('')).toBe('tooShort')
    expect(checkPasswordStrength(null)).toBe('tooShort')
    expect(checkPasswordStrength(undefined)).toBe('tooShort')
    expect(checkPasswordStrength('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe('tooShort')
    expect(checkPasswordStrength('a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull()
  })

  it('rejects the breach-corpus regulars, whatever the case', () => {
    expect(checkPasswordStrength('password')).toBe('tooCommon')
    expect(checkPasswordStrength('PASSWORD')).toBe('tooCommon')
    expect(checkPasswordStrength('PaSsWoRd')).toBe('tooCommon')
    expect(checkPasswordStrength('12345678')).toBe('tooCommon')
    expect(checkPasswordStrength('simplicity')).toBe('tooCommon')
  })

  it('sees through trailing digits, which is how the variants arrive', () => {
    expect(checkPasswordStrength('password123')).toBe('tooCommon')
    expect(checkPasswordStrength('qwerty1234')).toBe('tooCommon')
    expect(checkPasswordStrength('letmein2026')).toBe('tooCommon')
  })

  it('does not punish a real password for ending in a number', () => {
    expect(checkPasswordStrength('mangata-lake-2026')).toBeNull()
    expect(checkPasswordStrength('purple-otter-7')).toBeNull()
  })

  it('length is judged before commonness, so a short common one reads as short', () => {
    /* 'qwerty' is in the list AND under the minimum. It must come back
       tooShort: the message a person can act on is the one about length. */
    expect(checkPasswordStrength('qwerty')).toBe('tooShort')
  })
})
