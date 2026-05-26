import { useCallback, useEffect, useState } from 'react'
import { listUserQuestions, insertUserQuestion, updateUserQuestion, removeUserQuestion as apiRemove } from '../lib/api/userQuestions'

export function useUserQuestions() {
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setQuestions(await listUserQuestions())
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
        const data = await listUserQuestions()
        if (active) { setQuestions(data); setError(null) }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const addQuestion = useCallback(async (payload) => {
    const row = await insertUserQuestion(payload)
    setQuestions((prev) => [...prev, row])
    return row
  }, [])

  const toggleActive = useCallback(async (q) => {
    setQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, active: !q.active } : x)))
    try {
      await updateUserQuestion(q.id, { active: !q.active })
    } catch (e) {
      setError(e.message)
      refetch()
    }
  }, [refetch])

  const removeQuestion = useCallback(async (id) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id))
    try { await apiRemove(id) } catch (e) { setError(e.message); refetch() }
  }, [refetch])

  return { questions, loading, error, addQuestion, toggleActive, removeQuestion, refetch }
}
