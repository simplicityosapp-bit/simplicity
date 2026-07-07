import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Projects + the data the projects screen derives per-card stats from (clients /
// transactions / tasks). CRUD on the projects table; RLS scopes to the user.
const EMPTY = { projects: [], clients: [], transactions: [], tasks: [] }

async function fetchTable(name) {
  const { data, error } = await supabase.from(name).select('*').is('deleted_at', null).limit(2000)
  if (error) throw error
  return data ?? []
}

export function useProjectsData() {
  const [state, setState] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [projects, clients, transactions, tasks] = await Promise.all([
        fetchTable('projects'), fetchTable('clients'), fetchTable('transactions'), fetchTable('tasks'),
      ])
      setState({ projects, clients, transactions, tasks })
    } catch (e) {
      setError(e?.message || 'load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addProject = useCallback(async (payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const { data, error: e } = await supabase.from('projects').insert({ ...payload, user_id: session.user.id }).select().single()
    if (e) throw e
    setState((s) => ({ ...s, projects: [data, ...s.projects] }))
    return data
  }, [])

  const updateProject = useCallback(async (id, patch) => {
    setState((s) => ({ ...s, projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
    const { data, error: e } = await supabase.from('projects').update(patch).eq('id', id).select().single()
    if (e) { load(); throw e }
    setState((s) => ({ ...s, projects: s.projects.map((p) => (p.id === id ? data : p)) }))
  }, [load])

  const removeProject = useCallback(async (id) => {
    setState((s) => ({ ...s, projects: s.projects.filter((p) => p.id !== id) }))
    const { error: e } = await supabase.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (e) { load() }
  }, [load])

  return { ...state, loading, error, refetch: load, addProject, updateProject, removeProject }
}
