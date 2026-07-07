import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Daily questions + their answers, for the Insights screen. addAnswer upserts
// one answer per question per day; toggleActive/removeQuestion manage questions.
export function useInsightsData() {
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [{ data: q, error: qe }, { data: a, error: ae }] = await Promise.all([
        supabase.from('user_questions').select('*').is('deleted_at', null).limit(500),
        supabase.from('daily_answers').select('*').is('deleted_at', null).limit(5000),
      ])
      if (qe) throw qe
      if (ae) throw ae
      setQuestions((q ?? []).slice().sort((x, y) => (x.order ?? 0) - (y.order ?? 0)))
      setAnswers(a ?? [])
    } catch (e) {
      setError(e?.message || 'load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // One answer per (question, day): update the existing row, else insert.
  const addAnswer = useCallback(async ({ user_question_id, date, value_num }) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const existing = answers.find((a) => a.user_question_id === user_question_id && a.date === date && !a.deleted_at)
    if (existing) {
      const { data, error: e } = await supabase.from('daily_answers').update({ value_num }).eq('id', existing.id).select().single()
      if (e) throw e
      setAnswers((prev) => prev.map((a) => (a.id === existing.id ? (data || { ...a, value_num }) : a)))
      return
    }
    const row = { user_question_id, date, value_num, value_text: null, note: null, user_id: session.user.id }
    const { data, error: e } = await supabase.from('daily_answers').insert(row).select().single()
    if (e) throw e
    setAnswers((prev) => [...prev, data])
  }, [answers])

  const toggleActive = useCallback(async (q) => {
    setQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, active: !q.active } : x))) // optimistic
    const { error: e } = await supabase.from('user_questions').update({ active: !q.active }).eq('id', q.id)
    if (e) { setError(e.message); load() }
  }, [load])

  const removeQuestion = useCallback(async (id) => {
    setQuestions((prev) => prev.filter((x) => x.id !== id))
    const { error: e } = await supabase.from('user_questions').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (e) { load() }
  }, [load])

  return { questions, answers, loading, error, refetch: load, addAnswer, toggleActive, removeQuestion }
}
