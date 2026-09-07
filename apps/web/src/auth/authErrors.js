import i18n from '@simplicity/core/i18n'

/* Classify a Supabase auth error message into one of our own keys.
   Split out from translateAuthError because the KEY is worth more than the
   sentence at the call site: "wrong password" wants a way to reset one next
   to it, and "email not confirmed" wants the mail sent again — neither can be
   offered by a screen holding only a translated string it cannot match on. */
export function authErrorKey(msg = '') {
  const m = msg.toLowerCase()
  if (m.includes('invalid login')) return 'invalidLogin'
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('already exists'))
    return 'alreadyRegistered'
  if (m.includes('password should be at least')) return 'passwordTooShort'
  if (m.includes('email not confirmed')) return 'emailNotConfirmed'
  if (m.includes('invalid email') || m.includes('unable to validate email')) return 'invalidEmail'
  /* The third wording is the one the resend button meets: Supabase answers a
     second confirmation mail inside its per-address minute with "For security
     purposes, you can only request this after 51 seconds", which matches
     neither of the other two and so used to land on `generic` — "something
     went wrong", for a system working exactly as intended. */
  if (m.includes('rate limit') || m.includes('too many') || m.includes('you can only request this after'))
    return 'rateLimit'
  if (m.includes('provider is not enabled')) return 'providerDisabled'
  // Password-reset / set-new-password flow
  if (m.includes('different from the old') || m.includes('should be different')) return 'samePassword'
  if (m.includes('auth session missing') || m.includes('session_not_found') || m.includes('session not found'))
    return 'sessionExpired'
  return 'generic'
}

/* Map common Supabase auth error messages to a friendly, localized message.
   Returns a translated string in the active UI language (auth:errors.*).
   Called at error time (not a hook), so it reads the current language. */
export function translateAuthError(msg = '') {
  return i18n.t(`auth:errors.${authErrorKey(msg)}`)
}
