/* ════════════════════════════════════════════════════════════════
   CATEGORIES API — finance transaction categories (RLS-scoped).
   ════════════════════════════════════════════════════════════════
   These are user-defined groupings for expense transactions
   ("subscriptions", "consulting", etc.). Distinct from goal_categories
   which lives in a separate table. Each row carries a colour from a
   small preset palette — kept consistent with the prototype HTML.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

/* 8-colour palette ported from the prototype's CAT_COLORS in core.js.
   Categories pick from this fixed set so the UI doesn't need a full
   colour picker. */
export const CATEGORY_COLORS = [
  '#00c878', '#0099cc', '#d07040', '#8855cc',
  '#e05560', '#c8a040', '#00aaaa', '#cc5588',
]

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function insertCategory(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('categories').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateCategory(id, patch) {
  const { data, error } = await supabase.from('categories').update(sanitize(patch)).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removeCategory(id) {
  const { error } = await supabase.from('categories').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function listDeletedCategories() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .not('deleted_at', 'is', null)
    .gte('deleted_at', thirtyDaysAgo.toISOString())
    .order('deleted_at', { ascending: false })
  if (error) throw error
  return data
}

export async function restoreCategory(id) {
  const { data, error } = await supabase
    .from('categories')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
