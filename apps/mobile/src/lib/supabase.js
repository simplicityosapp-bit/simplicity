// Supabase client for React Native / Expo.
// Session persistence uses AsyncStorage (not localStorage); the URL polyfill is
// required so supabase-js's internal `new URL(...)` works on Hermes.
import 'react-native-url-polyfill/auto'
import { Platform, AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

// Public config (the anon key is safe to ship — same as the web bundle). Set both
// in apps/mobile/.env as EXPO_PUBLIC_* (Expo inlines EXPO_PUBLIC_ vars at build).
const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

// Preview mock — DEV + react-native-web only, gated on localStorage PREVIEW_MOCK
// so it can NEVER activate in a production build or on a real device (no
// localStorage on native; __DEV__ tree-shaken in prod). Lets the preview render
// the populated app without an interactive login. See lib/mockSupabase.js.
const previewMock = (typeof __DEV__ !== 'undefined' && __DEV__)
  && typeof window !== 'undefined' && window.localStorage
  && window.localStorage.getItem('PREVIEW_MOCK') === '1'

function realClient() {
  if (!url || !anonKey) {
    // eslint-disable-next-line no-console
    console.warn('[supabase] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — set them in apps/mobile/.env')
  }
  // On the WEB build (the app run in a browser), Google sign-in uses Supabase's
  // OAuth REDIRECT flow, so the client must read the auth code Supabase appends to
  // the return URL to complete the session. On native (device) that never applies
  // — the One Tap flow hands the id_token to signInWithIdToken directly — so it
  // stays off there. AsyncStorage transparently uses localStorage on RNW.
  const isWeb = Platform.OS === 'web'
  return createClient(url ?? '', anonKey ?? '', {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: isWeb,
    },
  })
}

// eslint-disable-next-line import/no-mutable-exports
let client
if (previewMock) {
  // Lazy require so the fixtures never even parse outside preview.
  // eslint-disable-next-line global-require
  client = require('./mockSupabase').makeMockClient()
  // eslint-disable-next-line no-console
  console.log('[supabase] PREVIEW MOCK MODE — using mock fixtures')
} else {
  client = realClient()
}

export const supabase = client

// Native only: the SDK's token-refresh timer is suspended while the app is
// backgrounded, so a session can expire in the background and the next request
// 401s. Wire refresh to AppState (per the Expo/Supabase guide): run it while the
// app is active, stop it when backgrounded. Web handles this itself (tab
// visibility); the preview mock client has no auth timers.
if (!previewMock && Platform.OS !== 'web' && client?.auth?.startAutoRefresh) {
  client.auth.startAutoRefresh()
  AppState.addEventListener('change', (state) => {
    if (state === 'active') client.auth.startAutoRefresh()
    else client.auth.stopAutoRefresh()
  })
}
