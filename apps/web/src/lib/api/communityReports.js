/* ════════════════════════════════════════════════════════════════
   COMMUNITY REPORTS API (0090) — the admin moderation queue.
   ════════════════════════════════════════════════════════════════
   RLS lets only admins SELECT/DELETE here (is_community_admin()). The embed
   pulls the reported message + its author so the queue is readable without a
   second lookup.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

const REPORT_EMBED = '*, message:community_messages(id, content, deleted_at, community_profiles(display_name))'

export async function listCommunityReports() {
  const { data, error } = await supabase
    .from('community_message_reports')
    .select(REPORT_EMBED)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}

/* Resolve = clear every report on a message (after removing it, or dismissing).
   Admin-only via RLS. */
export async function dismissReportsForMessage(messageId) {
  const { error } = await supabase
    .from('community_message_reports')
    .delete()
    .eq('message_id', messageId)
  if (error) throw error
}
