/* ════════════════════════════════════════════════════════════════
   CONSENT LOG API — the durable, append-only legal record of consent.
   ════════════════════════════════════════════════════════════════
   RLS = insert + select own rows only (no update/delete), so it can't be
   tampered with. recordConsent upserts with ignoreDuplicates, keyed on
   (user_id, kind, accepted_at), so the per-load sync (components/ConsentSync)
   is idempotent — the same acceptance is never double-recorded, but a
   re-acceptance (new accepted_at) adds a new row. See lib/legal.js.
   ════════════════════════════════════════════════════════════════ */
import { supabase } from '../supabase'
import { selectAllRows } from './paginate'

export async function listConsent() {
  return selectAllRows(() => supabase.from('user_consent').select('*').order('accepted_at', { ascending: true }))
}

/* rows: [{ kind, version, accepted, source, accepted_at }] — user_id is set
   from the session. No-op for empty input. Idempotent. */
export async function recordConsent(rows) {
  if (!rows?.length) return
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return
  const withUser = rows.map((r) => ({ ...r, user_id: session.user.id }))
  const { error } = await supabase
    .from('user_consent')
    .upsert(withUser, { onConflict: 'user_id,kind,accepted_at', ignoreDuplicates: true })
  if (error) throw error
}
