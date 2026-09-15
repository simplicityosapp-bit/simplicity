import { supabase } from './supabase'

/* The durable, append-only record of consent (public.user_consent) — port of
   apps/web/src/lib/api/consentLog.js. RLS allows insert + select of own rows
   only. Upserted with ignoreDuplicates on (user_id, kind, accepted_at), so
   recording the same acceptance twice is a no-op and a re-acceptance (a new
   accepted_at) adds a row. The server's created_at is the timestamp to trust. */
export async function recordConsent(rows) {
  if (!rows?.length) return
  const { data } = await supabase.auth.getSession()
  const session = data?.session
  if (!session) return
  const withUser = rows.map((r) => ({ ...r, user_id: session.user.id }))
  const { error } = await supabase
    .from('user_consent')
    .upsert(withUser, { onConflict: 'user_id,kind,accepted_at', ignoreDuplicates: true })
  if (error) throw error
}
