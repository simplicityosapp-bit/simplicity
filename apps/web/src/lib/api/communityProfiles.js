/* ════════════════════════════════════════════════════════════════
   COMMUNITY PROFILES API — the public identity behind a community message.
   ════════════════════════════════════════════════════════════════
   One row per user (community_profiles_user_uniq, migration 0082). It is the
   only user data another member can read, and since 0086 it is mandatory:
   community_messages.user_id carries an FK to it, so there is no posting
   without one.

   This table is column-restricted at the database, unlike every other module
   here. 0084/0085 revoked the table-wide grants and re-granted INSERT on
   (user_id, display_name, avatar_url) only — so is_verified is not merely
   "server-owned by convention", it is refused outright. sanitize() drops it
   for the same reason the other modules drop SERVER_OWNED: never send a
   column the server owns.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

/* is_verified sits here rather than in a separate list: the badge is the
   founder's to grant (0084), never the client's to claim. */
const SERVER_OWNED = ['id', 'user_id', 'created_at', 'is_verified']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

/* The signed-in user's own profile, or null when they haven't made one.
   null is a NORMAL answer, not an error — it is what the setup gate reads. */
export async function getMyCommunityProfile() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const { data, error } = await supabase
    .from('community_profiles')
    .select('id, user_id, display_name, avatar_url, is_verified, created_at, bio, headline, specialties, link')
    .eq('user_id', session.user.id)
    .maybeSingle()
  if (error) throw error
  return data
}

/* One member's public card, by user_id. Two callers:
   • the realtime path — a postgres_changes payload carries the raw row and no
     embed, so a message from someone the client has never seen arrives with an
     author id and no name;
   • the profile card (0091) — clicking an author fetches their full public
     identity, which the message embed deliberately doesn't carry.
   Readable cross-user by design (0082); that is the whole point of the table. */
export async function getCommunityProfileByUserId(userId) {
  if (!userId) return null
  const { data, error } = await supabase
    .from('community_profiles')
    .select('user_id, display_name, avatar_url, is_verified, created_at, bio, headline, specialties, link')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function insertCommunityProfile(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('community_profiles').insert(row).select().single()
  if (error) throw error
  return data
}

/* Edit an existing profile (0091 — bio/headline/specialties/link, plus the
   name). Scoped to the owner's own row by RLS (community_profiles_update_own):
   the .eq(user_id) is belt-and-braces, the policy is the real gate. sanitize()
   still strips the server-owned columns, so is_verified can't ride along. */
export async function updateCommunityProfile(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  const { data, error } = await supabase
    .from('community_profiles')
    .update(row)
    .eq('user_id', session.user.id)
    .select()
    .single()
  if (error) throw error
  return data
}

/* Ask the database whether a name is on the reserved list. 0084 exposes
   is_reserved_display_name as an RPC precisely so the UI can ask without
   being able to read the list itself — it answers one boolean about the
   string you hand it and discloses nothing else. */
export async function isReservedDisplayName(name) {
  const { data, error } = await supabase.rpc('is_reserved_display_name', { p_name: name })
  if (error) throw error
  return data === true
}

/* ── Turning a failed write into something a person can read ────────────────
   The reserved-name rule is enforced on INSERT by a RESTRICTIVE RLS policy
   (0085), and a policy refusal is always the same opaque 42501 — "new row
   violates row-level security policy" — with nothing in it about names. So
   the reason has to be recovered rather than read off the error.

   We ask the database instead of guessing. On this table the only restrictive
   INSERT rules are the reserved list and is_verified, and sanitize() above
   guarantees we never send is_verified — so a 42501 here is almost certainly
   a reserved name. "Almost" is not good enough for text we show a user, and
   the RPC settles it for the price of one round trip on a path that has
   already failed. It also closes the race where a name is added to the list
   between a check and the insert.

   Returns a symbolic reason for the caller to translate, or null when we
   genuinely don't know — in which case the caller should show the raw error
   rather than invent a friendlier lie. */
export async function reasonForProfileWriteError(error, name) {
  /* community_profiles_user_uniq — a profile already exists (another tab, or
     a double submit that beat the cache). */
  if (error?.code === '23505') return 'exists'
  /* The 0085 guard trigger. It only fires on UPDATE today, but it is the
     rule's other half and costs nothing to recognise. */
  if (error?.code === '23514') return 'reserved'
  if (error?.code === '42501') {
    try {
      if (await isReservedDisplayName(name)) return 'reserved'
    } catch {
      /* The classifier itself failed — fall through to the raw error rather
         than claim a reason we no longer have evidence for. */
    }
    return null
  }
  return null
}
