// Supabase client for React Native / Expo.
// Session persistence uses AsyncStorage (not localStorage); the URL polyfill is
// required so supabase-js's internal `new URL(...)` works on Hermes.
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

// Public config (the anon key is safe to ship — same as the web bundle). Set both
// in apps/mobile/.env as EXPO_PUBLIC_* (Expo inlines EXPO_PUBLIC_ vars at build).
const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn('[supabase] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — set them in apps/mobile/.env')
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL-based session handoff on native (that's a web-only OAuth redirect concern).
    detectSessionInUrl: false,
  },
})
