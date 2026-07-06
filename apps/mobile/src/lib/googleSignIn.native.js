// Google Sign-In — NATIVE (iOS/Android) implementation.
//
// Uses the One Tap / Universal Sign-In module (GoogleOneTapSignIn) — the module
// the library's own security docs recommend for Supabase, because it supports a
// verifiable NONCE on all platforms (the classic GoogleSignin.signIn() only does
// nonce on iOS + the paid tier). Flow:
//   1. hash a random rawNonce → nonceDigest (SHA-256, via expo-crypto)
//   2. pass nonceDigest to Google → it embeds it as the id_token `nonce` claim
//   3. pass the raw nonce to Supabase → it re-hashes and compares → replay-safe,
//      so we do NOT need "Skip Nonce Check" on the Supabase Google provider.
// Then signInWithIdToken exchanges the id_token for a Supabase session; the
// App-level onAuthStateChange (src/lib/auth.js) swaps to home. Same button is
// both sign-in AND sign-up (Supabase auto-creates the user on first token).
//
// Android note: the id_token's audience is the WEB client ID, so configure uses
// `webClientId`. The Android OAuth client (package + SHA-1 in Google Cloud
// Console) only authorizes the app to Google — it is never passed here.
import {
  GoogleOneTapSignIn,
  isSuccessResponse,
  isNoSavedCredentialFoundResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin'
import * as Crypto from 'expo-crypto'
import { supabase } from './supabase'
import i18n from './i18n'

// Web OAuth client ID (the SAME one the web app / Supabase provider already use).
// Set in apps/mobile/.env as EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID

export const googleAvailable = true

let configured = false
function ensureConfigured() {
  if (configured) return
  GoogleOneTapSignIn.configure({ webClientId: WEB_CLIENT_ID })
  configured = true
}

const tr = (k) => i18n.t(k)

// Random URL-safe nonce as a hex string (avoids btoa, which Hermes lacks), plus
// its SHA-256 digest. The digest goes to Google; the raw value goes to Supabase.
async function makeNonce(byteLength = 32) {
  const bytes = Crypto.getRandomValues(new Uint8Array(byteLength))
  let rawNonce = ''
  for (let i = 0; i < bytes.length; i += 1) rawNonce += bytes[i].toString(16).padStart(2, '0')
  const nonceDigest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce)
  return { rawNonce, nonceDigest }
}

// One Tap's documented three-step flow: silent sign-in → account creation →
// explicit picker. The SAME nonceDigest is reused across all three so the
// resulting id_token always carries the nonce we can verify against Supabase.
async function runOneTap(nonceDigest) {
  const a = await GoogleOneTapSignIn.signIn({ nonce: nonceDigest })
  if (isSuccessResponse(a)) return a
  if (isNoSavedCredentialFoundResponse(a)) {
    const b = await GoogleOneTapSignIn.createAccount({ nonce: nonceDigest })
    if (isSuccessResponse(b)) return b
    if (isNoSavedCredentialFoundResponse(b)) {
      return GoogleOneTapSignIn.presentExplicitSignIn({ nonce: nonceDigest })
    }
    return b // cancelled
  }
  return a // cancelled
}

// Returns one of:
//   { ok: true }            — signed in; the auth listener takes over
//   { cancelled: true }     — user dismissed / no credential (show nothing)
//   { error: '<message>' }  — localized, display-ready error string
export async function signInWithGoogle() {
  try {
    ensureConfigured()
    await GoogleOneTapSignIn.checkPlayServices()

    const { rawNonce, nonceDigest } = await makeNonce()
    const res = await runOneTap(nonceDigest)
    if (!isSuccessResponse(res)) return { cancelled: true }

    const idToken = res.data?.idToken
    if (!idToken) return { error: tr('auth:errors.generic') }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
      nonce: rawNonce,
    })
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
    if (isErrorWithCode(e) && e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return { error: tr('auth:errors.googlePlayServices') }
    }
    return { error: tr('auth:errors.generic') }
  }
}
