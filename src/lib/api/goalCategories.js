/* ════════════════════════════════════════════════════════════════
   GOAL CATEGORIES API — Supabase data access (RLS-scoped to the user).
   ════════════════════════════════════════════════════════════════
   CANONICAL: the auto-measurable default categories ARE seeded once per
   account on the first Goals visit (goals/index.jsx, guarded by
   prefs.goalsSeeded). The empty "choose where to start" chooser now only
   serves a user who deleted every category.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'
import { selectAllRows } from './paginate'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listGoalCategories() {
  return selectAllRows(() => supabase.from('goal_categories').select('*').is('deleted_at', null).order('created_at', { ascending: true }))
}

export async function insertGoalCategory(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('goal_categories').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateGoalCategory(id, patch) {
  const { data, error } = await supabase.from('goal_categories').update(sanitize(patch)).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removeGoalCategory(id) {
  const { error } = await supabase.from('goal_categories').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function listDeletedGoalCategories() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  return selectAllRows(() => supabase.from('goal_categories').select('*').not('deleted_at', 'is', null).gte('deleted_at', thirtyDaysAgo.toISOString()).order('deleted_at', { ascending: false }))
}

export async function restoreGoalCategory(id) {
  const { data, error } = await supabase
    .from('goal_categories')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
