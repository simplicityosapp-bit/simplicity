/* ════════════════════════════════════════════════════════════════
   GROUP MEMBERS API — Supabase data access (RLS-scoped to the user).
   ════════════════════════════════════════════════════════════════
   A membership links a client to a group with its tenure window
   (joined_at / left_at) and optional per-member price override.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'
import { selectAllRows } from './paginate'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listGroupMembers() {
  return selectAllRows(() => supabase
    .from('group_members')
    .select('*')
    .is('deleted_at', null)
    .order('joined_at', { ascending: false }))
}

export async function insertGroupMember(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('group_members').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateGroupMember(id, patch) {
  const { data, error } = await supabase.from('group_members').update(sanitize(patch)).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removeGroupMember(id) {
  const { error } = await supabase.from('group_members').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

/* Soft-delete restore — used by group-delete undo to re-attach members. */
export async function restoreGroupMember(id) {
  const { error } = await supabase.from('group_members').update({ deleted_at: null }).eq('id', id)
  if (error) throw error
}
