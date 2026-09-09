/* ════════════════════════════════════════════════════════════════
   PASSWORD GATE — one rule, both apps.
   ════════════════════════════════════════════════════════════════
   A free stand-in for Supabase's Pro-only leaked-password protection
   (HaveIBeenPwned). Follows NIST 800-63B: enforce a reasonable minimum
   length and reject the passwords that dominate every breach corpus, but
   do NOT impose forced composition rules (mixed case, symbols) — those
   cost usability without meaningfully improving real-world strength.

   It lives here rather than in either app because the two of them must
   agree. It was web-only, and the phone accepted `password` while the
   browser refused it — the same account, the same person, two answers,
   and the weaker one wins because it is the one that creates the account.
   ════════════════════════════════════════════════════════════════ */

export const MIN_PASSWORD_LENGTH = 8

/* Matched case-insensitively, and again with trailing digits stripped, so
   trivial variants (Password1, qwerty123) are caught without over-rejecting
   real passwords that merely end in a number. */
const COMMON_PASSWORDS = new Set([
  'password', 'passw0rd', 'p@ssword', 'p@ssw0rd',
  '12345678', '123456789', '1234567890', '12341234',
  'qwerty', 'qwertyui', 'qwertyuiop', 'asdfghjk', 'qazwsxedc',
  'iloveyou', 'admin', 'welcome', 'letmein', 'monkey', 'dragon',
  'sunshine', 'princess', 'football', 'baseball', 'superman',
  'abcd', 'abcdefg', 'qazwsx', 'trustno', 'changeme', 'simplicity',
])

export type PasswordIssue = 'tooShort' | 'tooCommon'

/* null when the password is acceptable, otherwise a reason code the caller
   maps to a localized message. */
export function checkPasswordStrength(pw: string | null | undefined): PasswordIssue | null {
  if (!pw || pw.length < MIN_PASSWORD_LENGTH) return 'tooShort'
  const lower = pw.toLowerCase().trim()
  const stripped = lower.replace(/\d+$/, '') // "password123" -> "password"
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(stripped)) return 'tooCommon'
  return null
}
