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
      const { data, error: e } = await supabase.from('tasks').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(2000)
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
    const done = task.status === 'done' // currently done → we're reopening
    // Marking done stamps completed_at + clears any custom (open-meta) status_id
    // so a finished task doesn't keep an "in progress"-style chip; reopening
    // clears completed_at. Mirrors web useTasks.toggleTask.
    const patch = {
      status: done ? 'todo' : 'done',
      completed_at: done ? null : new Date().toISOString(),
      ...(done ? {} : { status_id: null }),
    }
    const prev = { status: task.status, completed_at: task.completed_at ?? null, status_id: task.status_id ?? null }
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, ...patch } : t))) // optimistic
    const { error: e } = await supabase.from('tasks').update(patch).eq('id', task.id)
    if (e) {
      setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, ...prev } : t))) // rollback
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

  // Clear all completed tasks (soft-delete every done row at once).
  const clearCompleted = useCallback(async () => {
    const ids = tasks.filter((t) => t.status === 'done').map((t) => t.id)
    if (!ids.length) return
    setTasks((prev) => prev.filter((t) => t.status !== 'done'))
    const { error: e } = await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).in('id', ids)
    if (e) { load(); throw e }
  }, [tasks, load])

  return { tasks, loading, error, addTask, toggleDone, updateTask, deleteTask, clearCompleted, refetch: load }
}
