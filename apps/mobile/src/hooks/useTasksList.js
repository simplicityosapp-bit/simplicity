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

  const addTask = useCallback(async (payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const { data, error: e } = await supabase.from('tasks').insert({ ...payload, user_id: session.user.id }).select().single()
    if (e) throw e
    setTasks((prev) => [data, ...prev])
    return data
  }, [])

  const toggleDone = useCallback(async (task) => {
    const next = task.status === 'done' ? 'todo' : 'done'
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t))) // optimistic
    const { error: e } = await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    if (e) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t))) // rollback
    }
  }, [])

  // Edit a task (title/priority): optimistic patch, refetch to restore truth on
  // error. Returns the saved row (or throws so the sheet can surface the error).
  const updateTask = useCallback(async (id, patch) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t))) // optimistic
    const { data, error: e } = await supabase.from('tasks').update(patch).eq('id', id).select().single()
    if (e) { load(); throw e }
    setTasks((prev) => prev.map((t) => (t.id === id ? data : t)))
    return data
  }, [load])

  // Soft-delete (set deleted_at): optimistically drop the row; refetch on error.
  const deleteTask = useCallback(async (id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id)) // optimistic remove
    const { error: e } = await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (e) { load(); throw e }
  }, [load])

  return { tasks, loading, error, addTask, toggleDone, updateTask, deleteTask, refetch: load }
}
