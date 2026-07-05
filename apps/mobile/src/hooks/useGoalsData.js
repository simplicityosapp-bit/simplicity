import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Everything core moonGetData/goalsByCategory need to score goals. Keys match
// the MoonData shape (entries=goal_entries, answers=daily_answers,
// members=group_members).
async function fetchTable(name) {
  const { data, error } = await supabase.from(name).select('*').is('deleted_at', null).limit(2000)
  if (error) throw error
  return data ?? []
}

const EMPTY = { goals: [], categories: [], entries: [], transactions: [], clients: [], leads: [], answers: [], members: [], groups: [] }

export function useGoalsData() {
  const [state, setState] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [goals, categories, entries, transactions, clients, leads, answers, members, groups] = await Promise.all([
        fetchTable('goals'),
        fetchTable('categories'),
        fetchTable('goal_entries'),
        fetchTable('transactions'),
        fetchTable('clients'),
        fetchTable('leads'),
        fetchTable('daily_answers'),
        fetchTable('group_members'),
        fetchTable('groups'),
      ])
      setState({ goals, categories, entries, transactions, clients, leads, answers, members, groups })
    } catch (e) {
      setError(e?.message || 'load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { ...state, loading, error, refetch: load }
}
