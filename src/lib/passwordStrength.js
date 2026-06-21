// Lightweight, dependency-free password gate.
//
// A free stand-in for Supabase's Pro-only "leaked password protection"
// (HaveIBeenPwned). Follows NIST 800-63B guidance: enforce a reasonable
// minimum length and reject the most common / breached passwords, but DO NOT
// impose forced composition rules (mixed case/symbols) — those hurt usability
// without meaningfully improving real-world strength.

export const MIN_PASSWORD_LENGTH = 8

// The handful of passwords that dominate every breach corpus. Matched case-
// insensitively, and also with trailing digits stripped, so trivial variants
// (Password1, qwerty123) are caught without over-rejecting real passwords.
const COMMON_PASSWORDS = new Set([
  'password', 'passw0rd', 'p@ssword', 'p@ssw0rd',
  '12345678', '123456789', '1234567890', '12341234',
  'qwerty', 'qwertyui', 'qwertyuiop', 'asdfghjk', 'qazwsxedc',
  'iloveyou', 'admin', 'welcome', 'letmein', 'monkey', 'dragon',
  'sunshine', 'princess', 'football', 'baseball', 'superman',
  'abcd', 'abcdefg', 'qazwsx', 'trustno', 'changeme', 'simplicity',
])

// Returns null when the password is acceptable, otherwise a reason code
// ('tooShort' | 'tooCommon') the caller maps to a localized message.
export function checkPasswordStrength(pw) {
  if (!pw || pw.length < MIN_PASSWORD_LENGTH) return 'tooShort'
  const lower = pw.toLowerCase().trim()
  const stripped = lower.replace(/\d+$/, '') // "password123" -> "password"
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(stripped)) return 'tooCommon'
  return null
}
