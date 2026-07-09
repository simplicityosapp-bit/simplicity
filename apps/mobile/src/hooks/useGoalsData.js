import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { CATEGORY_PRESETS, OTHER_METRIC, OTHER_METRIC_KEY, presetToCategory } from '../lib/goalPresets'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']

// Everything core moonGetData/goalsByCategory need to score goals. Keys match
// the MoonData shape (entries=goal_entries, answers=daily_answers,
// members=group_members).
async function fetchTable(name) {
  const { data, error } = await supabase.from(name).select('*').is('deleted_at', null).limit(2000)
  if (error) throw error
  return data ?? []
}

const EMPTY = { goals: [], categories: [], entries: [], transactions: [], clients: [], leads: [], answers: [], members: [], groups: [], sessions: [], questions: [] }

export function useGoalsData() {
  const [state, setState] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true)
    if (!silent) setError(null)
    try {
      const [goals, categories, entries, transactions, clients, leads, answers, members, groups, sessions, questions] = await Promise.all([
        fetchTable('goals'),
        fetchTable('goal_categories'), // goal categories live in goal_categories, NOT categories (that's finance)
        fetchTable('goal_entries'),
        fetchTable('transactions'),
        fetchTable('clients'),
        fetchTable('leads'),
        fetchTable('daily_answers'),
        fetchTable('group_members'),
        fetchTable('groups'),
        fetchTable('sessions'),      // for the Moon cross-module overlay + correlations
        fetchTable('user_questions'),
      ])
      setState({ goals, categories, entries, transactions, clients, leads, answers, members, groups, sessions, questions })
    } catch (e) {
      if (!silent) setError(e?.message || 'load failed')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const insertInto = useCallback(async (table, payload, key) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const row = { ...payload }
    SERVER_OWNED.forEach((k) => delete row[k])
    row.user_id = session.user.id
    const { data: saved, error: insErr } = await supabase.from(table).insert(row).select().single()
    if (insErr) throw insErr
    setState((prev) => ({ ...prev, [key]: [saved, ...prev[key]] }))
    return saved
  }, [])

  // Resolve a metric_key to a category id (mirrors web goals/index resolveCategoryId):
  // reuse an existing category for that metric, else create it from the preset.
  const resolveCategoryId = useCallback(async (metricKey, cats) => {
    if (metricKey === OTHER_METRIC_KEY) {
      const existing = cats.find((c) => c.key === OTHER_METRIC_KEY)
      if (existing) return existing.id
      const created = await insertInto('goal_categories', presetToCategory(OTHER_METRIC), 'categories')
      return created.id
    }
    const preset = CATEGORY_PRESETS.find((p) => p.key === metricKey)
    if (!preset) throw new Error('unknown metric')
    const existing = cats.find((c) => c.data_source === preset.data_source)
    if (existing) return existing.id
    const created = await insertInto('goal_categories', presetToCategory(preset), 'categories')
    return created.id
  }, [insertInto])

  const addGoal = useCallback(async ({ metric_key, ...rest }) => {
    const category_id = await resolveCategoryId(metric_key, state.categories)
    return insertInto('goals', { category_id, ...rest }, 'goals')
  }, [resolveCategoryId, insertInto, state.categories])

  const updateGoal = useCallback(async (id, patch) => {
    const clean = { ...patch }
    SERVER_OWNED.forEach((k) => delete clean[k])
    const { data, error: e } = await supabase.from('goals').update(clean).eq('id', id).select().single()
    if (e) throw e
    setState((prev) => ({ ...prev, goals: prev.goals.map((g) => (g.id === id ? data : g)) }))
    return data
  }, [])

  const deleteGoal = useCallback(async (id) => {
    setState((prev) => ({ ...prev, goals: prev.goals.filter((g) => g.id !== id) }))
    const { error: e } = await supabase.from('goals').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (e) { load(); throw e }
  }, [load])

  return { ...state, loading, error, refetch: load, addGoal, updateGoal, deleteGoal }
}
