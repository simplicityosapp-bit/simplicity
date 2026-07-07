import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Soft-deleted rows across the app, kept 30 days (mirrors web useTrash). Generic:
// one { key, table, field } per entity — load deleted rows per table in parallel
// (allSettled so one broken lister can't blank the drawer), restore = clear
// deleted_at. group_members is excluded (restored via its parent).
export const TRASH_TYPES = [
  { key: 'clients', table: 'clients', field: 'name' },
  { key: 'projects', table: 'projects', field: 'name' },
  { key: 'groups', table: 'groups', field: 'name' },
  { key: 'tasks', table: 'tasks', field: 'title' },
  { key: 'leads', table: 'leads', field: 'name' },
  { key: 'leadSources', table: 'lead_sources', field: 'name' },
  { key: 'leadStatuses', table: 'lead_statuses', field: 'display_name' },
  { key: 'transactions', table: 'transactions', field: 'desc' },
  { key: 'categories', table: 'categories', field: 'name' },
  { key: 'recurring', table: 'recurring_templates', field: 'desc' },
  { key: 'sessions', table: 'sessions', field: 'summary' },
  { key: 'reminders', table: 'reminders', field: 'title' },
  { key: 'goals', table: 'goals', field: 'label' },
  { key: 'goalCategories', table: 'goal_categories', field: 'name' },
  { key: 'goalEntries', table: 'goal_entries', field: 'note' },
  { key: 'userQuestions', table: 'user_questions', field: 'custom_text' },
  { key: 'dailyAnswers', table: 'daily_answers', field: 'note' },
]

export function useTrash() {
  const [trash, setTrash] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const cutoff = new Date(Date.now() - 30 * 864e5).toISOString()
    const results = await Promise.allSettled(TRASH_TYPES.map((t) => (
      supabase.from(t.table).select('*').not('deleted_at', 'is', null).gte('deleted_at', cutoff).limit(500)
        .then((r) => { if (r.error) throw r.error; return r.data || [] })
    )))
    const next = {}
    let firstErr = null
    TRASH_TYPES.forEach((t, i) => {
      const r = results[i]
      if (r.status === 'fulfilled') next[t.key] = r.value
      else { next[t.key] = []; firstErr = firstErr || (r.reason?.message ?? 'load failed') }
    })
    setTrash(next)
    if (firstErr) setError(firstErr)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const restore = useCallback(async (key, id) => {
    const t = TRASH_TYPES.find((x) => x.key === key)
    if (!t) return
    setTrash((prev) => ({ ...prev, [key]: (prev[key] || []).filter((r) => r.id !== id) })) // optimistic
    const { error: e } = await supabase.from(t.table).update({ deleted_at: null }).eq('id', id)
    if (e) { setError(e.message); load() }
  }, [load])

  const totalCount = Object.values(trash).reduce((s, a) => s + (a?.length || 0), 0)
  return { trash, totalCount, loading, error, restore, refetch: load }
}
