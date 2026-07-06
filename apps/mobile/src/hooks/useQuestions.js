import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Daily questions (user_questions) — list + add + toggle-active + soft-delete.
// Mirrors web useUserQuestions. Feeds the QuestionsScreen and, transitively, the
// home InsightsWidget (which reads active, due-today questions).
const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']

export function useQuestions() {
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: e } = await supabase.from('user_questions').select('*').is('deleted_at', null).order('order', { ascending: true })
      if (e) throw e
      setQuestions(data ?? [])
    } catch (e) {
      setError(e?.message || 'load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addQuestion = useCallback(async (payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const row = { ...payload }
    SERVER_OWNED.forEach((k) => delete row[k])
    row.user_id = session.user.id
    const { data, error: e } = await supabase.from('user_questions').insert(row).select().single()
    if (e) throw e
    setQuestions((prev) => [...prev, data])
    return data
  }, [])

  const toggleActive = useCallback(async (q) => {
    setQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, active: !q.active } : x)))
    const { error: e } = await supabase.from('user_questions').update({ active: !q.active }).eq('id', q.id)
    if (e) { setError(e.message); load() }
  }, [load])

  const removeQuestion = useCallback(async (id) => {
    setQuestions((prev) => prev.filter((x) => x.id !== id))
    const { error: e } = await supabase.from('user_questions').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (e) { setError(e.message); load() }
  }, [load])

  return { questions, loading, error, refetch: load, addQuestion, toggleActive, removeQuestion }
}
