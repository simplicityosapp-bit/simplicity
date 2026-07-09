// Google Sign-In — DEFAULT (web / RNW / Node) implementation.
//
// The device build uses googleSignIn.native.js (the @react-native-google-signin
// One Tap flow — a native module that doesn't exist on react-native-web or under
// Node). Metro resolves the `.native.js` variant on iOS/Android and falls back to
// THIS file everywhere else. On the web build (the app run in a browser) we use
// Supabase's OAuth REDIRECT flow — the same one apps/web's login uses — so the
// Google button actually signs in instead of being an inert no-op. On return the
// App-level onAuthStateChange (src/lib/auth.js) picks up the session → home.
import { supabase } from './supabase'
import i18n from './i18n'

export const googleAvailable = true

// Returns { ok } (redirect started), { error } (localized), or throws never.
export async function signInWithGoogle() {
  try {
    const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : undefined
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: origin ? { redirectTo: origin } : undefined,
    })
    if (error) {
      const m = String(error.message || '').toLowerCase()
      return {
        error: m.includes('provider is not enabled')
          ? i18n.t('auth:errors.providerDisabled')
          : (error.message || i18n.t('auth:errors.generic')),
      }
    }
    // A full-page redirect to Google is now in flight; nothing more to do here.
    return { ok: true }
  } catch {
    return { error: i18n.t('auth:errors.generic') }
  }
}
