// Google Sign-In — NATIVE (iOS/Android) implementation.
//
// Official Supabase-recommended native flow: obtain a Google ID token via
// @react-native-google-signin/google-signin, then exchange it for a Supabase
// session with signInWithIdToken. No browser redirect (that's the web flow).
// The App-level onAuthStateChange listener (src/lib/auth.js) swaps to the home
// screen on success — same as email+password. First-time users are created
// automatically, so this button is both sign-in AND sign-up.
//
// Android note: the ID token's audience is the WEB client ID (not the Android
// one). So GoogleSignin.configure needs `webClientId`; the Android OAuth client
// (package + SHA-1, registered in Google Cloud Console) only authorizes the app
// to Google — it is never passed here.
import {
  GoogleSignin,
  isSuccessResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin'
import { supabase } from './supabase'
import i18n from './i18n'

// Web OAuth client ID (the SAME one the web app / Supabase provider already use).
// Set in apps/mobile/.env as EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID

export const googleAvailable = true

let configured = false
function ensureConfigured() {
  if (configured) return
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID })
  configured = true
}

const tr = (k) => i18n.t(k)

// Returns one of:
//   { ok: true }            — signed in; the auth listener takes over
//   { cancelled: true }     — user dismissed the sheet (show nothing)
//   { error: '<message>' }  — localized, display-ready error string
export async function signInWithGoogle() {
  try {
    ensureConfigured()
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })

    const response = await GoogleSignin.signIn()
    if (!isSuccessResponse(response)) {
      // v13+ returns { type: 'cancelled' } instead of throwing on dismiss.
      return { cancelled: true }
    }

    const idToken = response.data?.idToken
    if (!idToken) return { error: tr('auth:errors.generic') }

    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
    if (error) {
      const m = String(error.message || '').toLowerCase()
      return {
        error: m.includes('provider is not enabled')
          ? tr('auth:errors.providerDisabled')
          : tr('auth:errors.generic'),
      }
    }
    return { ok: true }
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS) {
        return { cancelled: true }
      }
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { error: tr('auth:errors.googlePlayServices') }
      }
    }
    return { error: tr('auth:errors.generic') }
  }
}
