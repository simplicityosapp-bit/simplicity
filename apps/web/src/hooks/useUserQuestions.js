import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listUserQuestions, insertUserQuestion, updateUserQuestion, removeUserQuestion as apiRemove, restoreUserQuestion } from '../lib/api/userQuestions'
import { pushUndo } from '../lib/undo'

/* React-Query-backed so every surface that reads daily questions shares ONE
   cache. The Home launcher (QuickRow) and the Home daily-question slider
   (InsightsWidget) previously held independent useState copies, so a question
   created from the launcher never appeared in the slider until Home remounted.
   A single ['userQuestions'] cache keeps them in sync — and removes the
   duplicate fetch Home fired (one per instance). Public API is unchanged. */
const KEY = ['userQuestions']

export function useUserQuestions() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listUserQuestions })
  const questions = data ?? []

  const addQuestion = useCallback(async (payload) => {
    /* Default `order` to the current count so a question created from the goal
       modals (which don't pass one) sorts LAST instead of jumping position on
       the next refetch by a null order. An explicit order (AddQuestionModal)
       still wins. */
    const order = payload.order ?? (qc.getQueryData(KEY) ?? []).length
    const row = await insertUserQuestion({ ...payload, order })
    qc.setQueryData(KEY, (prev) => [...(prev ?? []), row])
    return row
  }, [qc])

  const toggleActive = useCallback(async (q) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((x) => (x.id === q.id ? { ...x, active: !q.active } : x))) // optimistic
    try {
      await updateUserQuestion(q.id, { active: !q.active })
    } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  const updateQuestion = useCallback(async (id, patch) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x))) // optimistic
    try {
      const row = await updateUserQuestion(id, patch)
      qc.setQueryData(KEY, (prev) => (prev ?? []).map((x) => (x.id === id ? row : x)))
      return row
    } catch (e) { qc.invalidateQueries({ queryKey: KEY }); throw e }
  }, [qc])

  const removeQuestion = useCallback(async (id) => {
    const row = (qc.getQueryData(KEY) ?? []).find((q) => q.id === id)
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((q) => q.id !== id)) // optimistic
    try {
      await apiRemove(id)
      if (row) pushUndo({
        label: 'השאלה נמחקה',
        undo: async () => {
          qc.setQueryData(KEY, (prev) => [row, ...(prev ?? []).filter((r) => r.id !== id)])
          try { await restoreUserQuestion(id) } finally { qc.invalidateQueries({ queryKey: KEY }) }
        },
        redo: async () => {
          qc.setQueryData(KEY, (prev) => (prev ?? []).filter((q) => q.id !== id))
          try { await apiRemove(id) } catch { qc.invalidateQueries({ queryKey: KEY }) }
        },
      })
    } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { questions, loading: isLoading, error: error?.message ?? null, addQuestion, toggleActive, updateQuestion, removeQuestion, refetch }
}
