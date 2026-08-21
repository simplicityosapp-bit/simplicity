/* ════════════════════════════════════════════════════════════════
   GOAL CATEGORIES API — Supabase data access (RLS-scoped to the user).
   ════════════════════════════════════════════════════════════════
   Categories are NOT seeded. de5e8eb7 dropped the one-time seeding along with
   the on-screen metric management, and prefs.goalsSeeded has not existed in the
   code since — only in comments like the one this replaces. A category is
   created on demand when a goal first needs it (goals/index.jsx →
   resolveCategoryId), and the "choose where to start" chooser it mentions is
   GoalCategoryPicker, which nothing imports.
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
