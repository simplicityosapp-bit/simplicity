import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { selectAll } from '../lib/paginate'
import { pushUndo } from '../lib/undo'
import i18n from '../lib/i18n'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']

// Daily questions + their answers, for the Insights screen ("מה איתך היום"):
// the single place questions are both answered AND managed. addAnswer upserts one
// answer per question per day; addQuestion/toggleActive/removeQuestion manage them.
export function useInsightsData() {
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState([])
  /* Which questions a goal is tracked by (goals.tracked_by_question_id) — the
     card says so, as web's settings list does. */
  const [linkedQuestionIds, setLinkedQuestionIds] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [{ data: q, error: qe }, { data: a, error: ae }, { data: g }] = await Promise.all([
        supabase.from('user_questions').select('*').is('deleted_at', null).limit(500),
        /* Every answer, paged past the server's 1000-row cap (web
           listDailyAnswers). The old .limit(5000) was never honoured above
           1000, and with no order the 1000 that came back were arbitrary — so
           a coach past about a year of answers had averages, the heatmap and
           the reflections computed from a random subset. */
        selectAll(() => supabase.from('daily_answers').select('*').is('deleted_at', null).order('date', { ascending: false })),
        // Best-effort: without it the card just doesn't mark goal-linked questions.
        Promise.resolve().then(() => supabase.from('goals').select('tracked_by_question_id').is('deleted_at', null).not('tracked_by_question_id', 'is', null))
          .catch(() => ({ data: [] })),
      ])
      if (qe) throw qe
      if (ae) throw ae
      setQuestions((q ?? []).slice().sort((x, y) => (x.order ?? 0) - (y.order ?? 0)))
      setAnswers(a ?? [])
      setLinkedQuestionIds(new Set((g ?? []).map((row) => row.tracked_by_question_id).filter(Boolean)))
    } catch (e) {
      setError(e?.message || 'load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // One answer per (question, day). Update a locally-known row directly; else
  // insert, and on the (question,date) partial-unique clash (23505 — the row
  // exists server-side but not in local state, e.g. it was answered today on web
  // or the Home widget) UPDATE it instead of surfacing a raw DB error. Mirrors
  // web insertDailyAnswer + the Home widget's addAnswer.
  const addAnswer = useCallback(async ({ user_question_id, date, value_num }) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const existing = answers.find((a) => a.user_question_id === user_question_id && a.date === date && !a.deleted_at)
    if (existing) {
      const { data, error: e } = await supabase.from('daily_answers').update({ value_num }).eq('id', existing.id).select().single()
      if (e) throw e
      setAnswers((prev) => prev.map((a) => (a.id === existing.id ? (data || { ...a, value_num }) : a)))
      return data
    }
    const row = { user_question_id, date, value_num, value_text: null, note: null, user_id: session.user.id }
    const { data: ins, error } = await supabase.from('daily_answers').insert(row).select().single()
    if (error) {
      if (error.code === '23505') {
        const { data: upd, error: updErr } = await supabase.from('daily_answers')
          .update({ value_num, value_text: null, note: null })
          .eq('user_question_id', user_question_id).eq('date', date).is('deleted_at', null)
          .select().single()
        if (updErr) throw updErr
        setAnswers((prev) => (prev.some((a) => a.id === upd.id) ? prev.map((a) => (a.id === upd.id ? upd : a)) : [upd, ...prev]))
        return upd
      }
      throw error
    }
    setAnswers((prev) => [...prev, ins])
    return ins
  }, [answers])

  const addQuestion = useCallback(async (payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const row = { ...payload }
    SERVER_OWNED.forEach((k) => delete row[k])
    row.user_id = session.user.id
    const { data, error: e } = await supabase.from('user_questions').insert(row).select().single()
    if (e) throw e
    setQuestions((prev) => [...prev, data].slice().sort((x, y) => (x.order ?? 0) - (y.order ?? 0)))
    return data
  }, [])

  const toggleActive = useCallback(async (q) => {
    setQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, active: !q.active } : x))) // optimistic
    const { error: e } = await supabase.from('user_questions').update({ active: !q.active }).eq('id', q.id)
    if (e) { setError(e.message); load() }
  }, [load])

  /* Soft-delete with an undo (web useUserQuestions / useDailyAnswers). The
     question went straight to the trash with no way back from the screen. */
  const softDelete = useCallback(async ({ table, id, row, drop, restore, label }) => {
    const stamp = (at) => supabase.from(table).update({ deleted_at: at }).eq('id', id)
    drop()
    const { error: e } = await stamp(new Date().toISOString())
    if (e) { load(); return }
    if (!row) return
    pushUndo({
      label,
      undo: async () => { const { error: ue } = await stamp(null); if (ue) load(); else restore() },
      redo: async () => { drop(); const { error: re } = await stamp(new Date().toISOString()); if (re) load() },
    })
  }, [load])

  const removeQuestion = useCallback((id) => {
    const row = questions.find((x) => x.id === id)
    return softDelete({
      table: 'user_questions', id, row, label: i18n.t('components:undo.deleted.question'),
      drop: () => setQuestions((prev) => prev.filter((x) => x.id !== id)),
      restore: () => setQuestions((prev) => (prev.some((x) => x.id === id) ? prev : [...prev, row].sort((x, y) => (x.order ?? 0) - (y.order ?? 0)))),
    })
  }, [questions, softDelete])

  /* One answer, from the history — re-answering only upserts TODAY, so a value
     logged on the wrong day otherwise stayed in the averages for good. */
  const removeAnswer = useCallback((id) => {
    const row = answers.find((x) => x.id === id)
    return softDelete({
      table: 'daily_answers', id, row, label: i18n.t('components:undo.deleted.answer'),
      drop: () => setAnswers((prev) => prev.filter((x) => x.id !== id)),
      restore: () => setAnswers((prev) => (prev.some((x) => x.id === id) ? prev : [...prev, row])),
    })
  }, [answers, softDelete])

  const updateQuestion = useCallback(async (id, patch) => {
    setQuestions((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x))) // optimistic
    const { error: e } = await supabase.from('user_questions').update(patch).eq('id', id)
    if (e) { setError(e.message); load() }
  }, [load])

  return { questions, answers, linkedQuestionIds, loading, error, refetch: load, addAnswer, addQuestion, toggleActive, removeQuestion, removeAnswer, updateQuestion }
}
