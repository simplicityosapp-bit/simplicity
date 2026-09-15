import { authErrorKey } from '@simplicity/core'
import i18n from './i18n'

/* Supabase auth message → the user's language, through the same key web uses
   (@simplicity/core/domain/authErrors). Called at error time, so it reads the
   current language. */
export { authErrorKey }
export function translateAuthError(msg) {
  return i18n.t(`auth:errors.${authErrorKey(msg)}`)
}
