import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// First mobile mutation layer — tasks list + optimistic mark-done. RLS scopes
// rows to the user. toggleDone flips locally first, then persists; on error it
// rolls the row back. (A shared React Query cache like web's is a later step.)
export function useTasksList() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: e } = await supabase.from('tasks').select('*').is('deleted_at', null).limit(2000)
      if (e) throw e
      setTasks(data ?? [])
    } catch (e) {
      setError(e?.message || 'load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggleDone = useCallback(async (task) => {
    const next = task.status === 'done' ? 'todo' : 'done'
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t))) // optimistic
    const { error: e } = await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    if (e) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t))) // rollback
    }
  }, [])

  return { tasks, loading, error, toggleDone, refetch: load }
}
