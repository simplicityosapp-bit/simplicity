/* ════════════════════════════════════════════════════════════════
   USER PREFERENCES API — single row per user, holding all settings
   inside one JSONB blob (`preferences`).
   ════════════════════════════════════════════════════════════════
   The shape lives in lib/preferences.js (DEFAULT_PREFS + migrate).
   This file is just CRUD. */

import { supabase } from '../supabase'

/* Read the current user's preferences row. Returns null if the row
   doesn't exist yet — caller decides whether to seed it. */
export async function getUserPreferences() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const { data, error } = await supabase
    .from('user_preferences')
    .select('preferences')
    .eq('user_id', session.user.id)
    .maybeSingle()
  if (error) throw error
  return data ? data.preferences : null
}

/* Update the existing row. Use after a row is known to exist (or
   after seedUserPreferences). */
export async function updateUserPreferences(preferences) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const { data, error } = await supabase
    .from('user_preferences')
    .update({ preferences })
    .eq('user_id', session.user.id)
    .select('preferences')
    .maybeSingle()
  if (error) throw error
  /* If no row was updated, fall back to insert (first time). */
  if (!data) return seedUserPreferences(preferences)
  return data.preferences
}

/* One-time seed — insert the row if missing. Idempotent: returns
   the existing row's preferences if a 23505 conflict fires. */
export async function seedUserPreferences(preferences) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = { user_id: session.user.id, preferences }
  const { data, error } = await supabase
    .from('user_preferences')
    .insert(row)
    .select('preferences')
    .single()
  if (error) {
    /* 23505 = unique_violation. Someone (another tab / another hook
       instance) already seeded — just read the row. */
    if (error.code === '23505') {
      const existing = await getUserPreferences()
      return existing || preferences
    }
    throw error
  }
  return data.preferences
}
