import { useCallback, useEffect, useState } from 'react'
import { listTasks, insertTask, updateTask, removeTask as apiRemoveTask } from '../lib/api/tasks'

export function useTasks() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setTasks(await listTasks())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const data = await listTasks()
        if (active) { setTasks(data); setError(null) }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const addTask = useCallback(async (payload) => {
    const row = await insertTask(payload)
    setTasks((prev) => [row, ...prev])
    return row
  }, [])

  const toggleTask = useCallback(async (task) => {
    const done = task.status === 'done'
    const patch = { status: done ? 'todo' : 'done', completed_at: done ? null : new Date().toISOString() }
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...patch } : t)))
    try {
      await updateTask(task.id, patch)
    } catch (e) {
      setError(e.message)
      refetch()
    }
  }, [refetch])

  const removeTask = useCallback(async (id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    try { await apiRemoveTask(id) } catch (e) { setError(e.message); refetch() }
  }, [refetch])

  return { tasks, loading, error, addTask, toggleTask, removeTask, refetch }
}
