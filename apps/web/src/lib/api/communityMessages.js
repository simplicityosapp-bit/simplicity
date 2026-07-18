/* ════════════════════════════════════════════════════════════════
   COMMUNITY MESSAGES API — the one global room.
   ════════════════════════════════════════════════════════════════
   The database does most of the work here, and this module's job is mostly
   to not fight it:
     • SELECT already hides soft-deleted rows (0081 filters `deleted_at IS
       NULL` in the policy itself, not in the query), so there is no
       .is('deleted_at', null) here. Adding one would be dead weight.
     • INSERT is column-granted to (content, user_id) only (0085). Sending
       id/created_at/deleted_at is not "ignored" — it is a 42501. sanitize()
       drops them.
     • A profile row is mandatory (0086's FK), so an insert without one fails
       23503 rather than creating an orphan.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

/* The palette — the 5 reactions the UI offers. Defined here (not in the DB) so
   it can grow without a migration; 0087 only length-guards the emoji column.
   Order = display order in the picker. */
export const REACTION_EMOJIS = ['👍', '❤️', '🙏', '😂', '🎉']

/* The message embed. Author since 0086; reactions since 0087; mentions since
   0089 — the mention's FK to community_profiles.user_id lets us nest the
   mentioned member's display_name for the @-highlight, right in the same query. */
const WITH_AUTHOR = '*, community_profiles(display_name, avatar_url, is_verified), community_message_reactions(emoji, user_id), community_message_mentions(mentioned_user_id, community_profiles(display_name))'

/* Everything except content is the server's (0085's grant enforces it). */
const SERVER_OWNED = ['id', 'user_id', 'created_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

/* One window of the room, newest-first off 0080's created_at DESC index, then
   flipped to ascending for display (a chat reads downward, newest pinned to the
   bottom). Keyset pagination, not offset: `before` is the created_at of the
   oldest row already held, and "load older" asks for the next page strictly
   older than it — stable even as new messages arrive at the bottom. No `before`
   = the newest page, the room's default landing. */
export const MESSAGES_PAGE = 50

export async function listCommunityMessages({ before = null, limit = MESSAGES_PAGE } = {}) {
  let q = supabase
    .from('community_messages')
    .select(WITH_AUTHOR)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (before) q = q.lt('created_at', before)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).slice().reverse()
}

/* Server-side substring search across the room. Newest-first and capped: this
   REPLACES the feed while a term is active, so it doesn't paginate — refining
   the term is how you narrow, not a second page. deleted_at IS NULL is enforced
   by the SELECT policy (0081), same as the feed. % and _ are escaped so a
   literal percent in the query isn't read as a LIKE wildcard. */
export async function searchCommunityMessages(term, { limit = MESSAGES_PAGE } = {}) {
  const escaped = term.replace(/[\\%_]/g, (c) => `\\${c}`)
  const { data, error } = await supabase
    .from('community_messages')
    .select(WITH_AUTHOR)
    .ilike('content', `%${escaped}%`)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function insertCommunityMessage(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('community_messages').insert(row).select().single()
  if (error) throw error
  return data
}

/* Soft delete — 0083's one legal transition: my own live message → deleted.
   ⚠️  NO .select() here, and that is not an oversight. Asking for the row back
   makes PostgREST add RETURNING, and RETURNING is filtered by the SELECT
   policy — which this row has, by design, just stopped satisfying. The update
   commits either way; with .select() the response comes back empty and reads
   like a failure. Without it, supabase-js sends Prefer: return=minimal. */
export async function softDeleteCommunityMessage(id) {
  const { error } = await supabase
    .from('community_messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/* ── Naming the room's refusals ─────────────────────────────────────────────
   Same idea as reasonForProfileWriteError, different table. Returns a
   symbolic reason, or null when we genuinely don't know — the caller shows
   the raw error rather than inventing a friendlier lie.

   23503 → the 0086 FK: no community_profiles row. The gate should make this
           unreachable, so treat it as "the gate was bypassed or raced", not
           as a user error: send them to make a profile.
   42501 → an RLS refusal. VERIFIED unreachable today, and worth writing down
           because the brief asked: the reserved-name rules live on
           community_profiles, NOT on community_messages. This table's only
           restrictive INSERT policy is `deleted_at IS NULL` (0085), and we
           never send deleted_at. The one permissive check is
           `user_id = auth.uid() AND community_access()` — user_id is set from
           the session, and community_access() is open to every signed-in user.
           It becomes reachable the day community_access() gates on a
           subscription (0080's swap), which is exactly when "the room is not
           yours to post in" starts being a real answer. Hence 'blocked'
           rather than a crash.
   ────────────────────────────────────────────────────────────────────────── */
export function reasonForMessageWriteError(error) {
  if (error?.code === '23503') return 'noProfile'
  if (error?.code === '42501') return 'blocked'
  return null
}

/* ── Reactions (0087) ───────────────────────────────────────────────────────
   A react is an INSERT, an un-react a DELETE — the toggle lives in the caller,
   which knows the current state from the embedded reactions. */

export async function addReaction(messageId, emoji) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  /* The UNIQUE(message_id, user_id, emoji) makes a double-react a 23505; ignore
     it (someone reacted from another tab first) rather than surface an error —
     the end state is identical. */
  const { error } = await supabase
    .from('community_message_reactions')
    .insert({ message_id: messageId, user_id: session.user.id, emoji })
  if (error && error.code !== '23505') throw error
}

/* No .select(): a bare delete returns 204 (return=minimal) and we don't need
   the row back — the caller already removed it optimistically. */
export async function removeReaction(messageId, emoji) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const { error } = await supabase
    .from('community_message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', session.user.id)
    .eq('emoji', emoji)
  if (error) throw error
}

/* ── Mentions (0089) ────────────────────────────────────────────────────────
   Members for the @-autocomplete, and the mention rows a sent message tags. */

export async function listCommunityMembers() {
  const { data, error } = await supabase
    .from('community_profiles')
    .select('user_id, display_name, avatar_url, is_verified')
    .order('display_name', { ascending: true })
  if (error) throw error
  return data ?? []
}

/* Tag a just-sent message. RLS lets the author insert only on their OWN message;
   the DB trigger turns each row into a notification for the mentioned member
   (never the author). Deduped; empty is a no-op. */
export async function insertMentions(messageId, userIds) {
  const unique = [...new Set(userIds)].filter(Boolean)
  if (!unique.length) return
  const rows = unique.map((id) => ({ message_id: messageId, mentioned_user_id: id }))
  const { error } = await supabase.from('community_message_mentions').insert(rows)
  if (error) throw error
}

/* ── Moderation (0090, admin-gated by RLS) ──────────────────────────────────
   Pin/unpin: an admin sets pinned_at. The RLS admin policy authorises it; the
   0083 immutable trigger still blocks any content change, so this only ever
   flips pinned_at. */
export async function setMessagePinned(messageId, pinned) {
  const { error } = await supabase
    .from('community_messages')
    .update({ pinned_at: pinned ? new Date().toISOString() : null })
    .eq('id', messageId)
  if (error) throw error
}

/* A member flags a message. 23505 (already reported) is a no-op success — the
   queue only needs one row per (message, reporter). */
export async function reportMessage(messageId, reason) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const { error } = await supabase
    .from('community_message_reports')
    .insert({ message_id: messageId, reporter_id: session.user.id, reason: reason || null })
  if (error && error.code !== '23505') throw error
}
