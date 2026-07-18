/* ════════════════════════════════════════════════════════════════
   COMMUNITY NOTIFICATIONS API (0089) — the current member's in-app inbox.
   ════════════════════════════════════════════════════════════════
   Members only READ their own (RLS) and mark them read; notifications are born
   server-side (a mention trigger), never client-inserted. The embed pulls the
   actor's public name (actor_id → community_profiles) and the message snippet
   (message_id → community_messages) for a readable list.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

const NOTIF_EMBED = '*, actor:community_profiles(display_name, avatar_url), message:community_messages(content)'

export async function listCommunityNotifications() {
  const { data, error } = await supabase
    .from('community_notifications')
    .select(NOTIF_EMBED)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}

/* Mark unread notifications read. With ids → just those; without → all unread.
   No .select() — the caller already flipped them optimistically. */
export async function markNotificationsRead(ids) {
  let q = supabase
    .from('community_notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
  if (ids?.length) q = q.in('id', ids)
  const { error } = await q
  if (error) throw error
}
