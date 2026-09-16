import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { selectAll } from '../lib/paginate'
import { resolveGoalCategoryId } from '../lib/goalPresets'
import { pushUndo } from '../lib/undo'
import i18n from '../lib/i18n'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']

// Everything core moonGetData/goalsByCategory need to score goals. Keys match
// the MoonData shape (entries=goal_entries, answers=daily_answers,
// members=group_members). Paginated so income-goal progress (transactions-backed)
// doesn't under-count past the row cap.
async function fetchTable(name) {
  const { data, error } = await selectAll(() => supabase.from(name).select('*').is('deleted_at', null))
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

  // A metric_key → category id (find-or-create; lib/goalPresets).
  const resolveCategoryId = useCallback(
    (metricKey, cats) => resolveGoalCategoryId(metricKey, cats, (row) => insertInto('goal_categories', row, 'categories')),
    [insertInto],
  )

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

  /* Soft-delete a row and offer the undo (web registerDeleteUndo): the row
     leaves the list at once, the toast puts it back, redo takes it out again. */
  const softDelete = useCallback(async (table, key, id, label) => {
    const row = state[key].find((r) => r.id === id)
    const drop = () => setState((prev) => ({ ...prev, [key]: prev[key].filter((r) => r.id !== id) }))
    const stamp = (at) => supabase.from(table).update({ deleted_at: at }).eq('id', id)
    drop()
    const { error: e } = await stamp(new Date().toISOString())
    if (e) { load(true); throw e }
    if (!row) return
    pushUndo({
      label,
      undo: async () => {
        const { error: ue } = await stamp(null)
        if (!ue) setState((prev) => (prev[key].some((r) => r.id === id) ? prev : { ...prev, [key]: [row, ...prev[key]] }))
      },
      redo: async () => { drop(); const { error: re } = await stamp(new Date().toISOString()); if (re) load(true) },
    })
  }, [state, load])

  const deleteGoal = useCallback((id) => softDelete('goals', 'goals', id, i18n.t('components:undo.deleted.goal')), [softDelete])

  // A manual progress entry, for one goal (goal_id, migration 0110).
  const addEntry = useCallback((payload) => insertInto('goal_entries', payload, 'entries'), [insertInto])
  const removeEntry = useCallback((id) => softDelete('goal_entries', 'entries', id, i18n.t('components:undo.deleted.goalEntry')), [softDelete])

  return { ...state, loading, error, refetch: load, addGoal, updateGoal, deleteGoal, addEntry, removeEntry, resolveCategoryId }
}
