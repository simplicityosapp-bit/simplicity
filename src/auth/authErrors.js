import i18n from '../i18n'

/* Map common Supabase auth error messages to a friendly, localized message.
   Returns a translated string in the active UI language (auth:errors.*).
   Called at error time (not a hook), so it reads the current language. */
export function translateAuthError(msg = '') {
  const m = msg.toLowerCase()
  const e = (key) => i18n.t(`auth:errors.${key}`)
  if (m.includes('invalid login')) return e('invalidLogin')
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('already exists'))
    return e('alreadyRegistered')
  if (m.includes('password should be at least')) return e('passwordTooShort')
  if (m.includes('email not confirmed')) return e('emailNotConfirmed')
  if (m.includes('invalid email') || m.includes('unable to validate email')) return e('invalidEmail')
  if (m.includes('rate limit') || m.includes('too many')) return e('rateLimit')
  if (m.includes('provider is not enabled')) return e('providerDisabled')
  // Password-reset / set-new-password flow
  if (m.includes('different from the old') || m.includes('should be different')) return e('samePassword')
  if (m.includes('auth session missing') || m.includes('session_not_found') || m.includes('session not found'))
    return e('sessionExpired')
  return e('generic')
}
