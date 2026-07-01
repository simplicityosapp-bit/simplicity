import { createClient } from '@supabase/supabase-js'
import { makeMockClient } from './mockSupabase'

/* Browser Supabase client. Uses the publishable (anon) key — safe to ship;
   row-level security on every table enforces per-user access. */
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/* DEV-only preview mock: when running the dev server with `?mock=1` in the
   URL (or localStorage PREVIEW_MOCK==='1'), swap in a fake client backed by
   src/data/mock.js so the logged-in UI renders without auth/network. Used to
   verify UI changes when an interactive login isn't available. In a
   production build `import.meta.env.DEV` is statically false, so this branch
   and the mock import are tree-shaken away — the real client always ships. */
const useMock = import.meta.env.DEV && (() => {
  try {
    const params = new URLSearchParams(window.location.search)
    return params.has('mock') || window.localStorage.getItem('PREVIEW_MOCK') === '1'
  } catch {
    return false
  }
})()

if (!useMock && (!url || !anonKey)) {
  // Surfaced loudly in dev so a missing .env.local isn't a silent failure.
  console.error('Supabase env missing — check mangata-react/.env.local (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).')
}

export const supabase = useMock
  ? (console.warn('[preview] Using MOCK Supabase client — fixtures from src/data/mock.js, no real data.'), makeMockClient())
  : createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
