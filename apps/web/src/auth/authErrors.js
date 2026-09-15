import i18n from '@simplicity/core/i18n'
import { authErrorKey } from '@simplicity/core'

/* Classify a Supabase auth error message into one of our own keys. The
   classification lives in @simplicity/core/domain/authErrors, which the phone
   reads too, so the same Supabase answer means the same thing in both apps.
   Re-exported here because this is where the screens import it. */
export { authErrorKey }

/* Map common Supabase auth error messages to a friendly, localized message.
   Returns a translated string in the active UI language (auth:errors.*).
   Called at error time (not a hook), so it reads the current language. */
export function translateAuthError(msg = '') {
  return i18n.t(`auth:errors.${authErrorKey(msg)}`)
}
