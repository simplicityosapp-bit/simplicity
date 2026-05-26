import { createClient } from '@supabase/supabase-js'

/* Browser Supabase client. Uses the publishable (anon) key — safe to ship;
   row-level security on every table enforces per-user access. */
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Surfaced loudly in dev so a missing .env.local isn't a silent failure.
  console.error('Supabase env missing — check mangata-react/.env.local (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).')
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
