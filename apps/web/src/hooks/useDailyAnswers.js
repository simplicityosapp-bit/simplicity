import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listDailyAnswers, insertDailyAnswer,
  removeDailyAnswer as apiRemove, restoreDailyAnswer,
} from '../lib/api/dailyAnswers'
import { registerDeleteUndo } from '../lib/undoActions'
import i18n from '@simplicity/core/i18n'
import { revertWrite } from '../lib/revertWrite'

/* React-Query-backed: shared across moon + insights widgets. Public API unchanged. */
const KEY = ['dailyAnswers']

export function useDailyAnswers() {
  const qc = useQueryClient()
  const { data, isLoading, error, fetchStatus, refetch } = useQuery({ queryKey: KEY, queryFn: listDailyAnswers })
  const answers = data ?? []

  const addAnswer = useCallback(async (payload) => {
    const row = await insertDailyAnswer(payload)
    /* insertDailyAnswer may UPDATE an existing row (edit-today's-answer on a
       duplicate), so replace by id if already cached, else prepend. */
    qc.setQueryData(KEY, (prev) => {
      const list = prev ?? []
      return list.some((r) => r.id === row.id) ? list.map((r) => (r.id === row.id ? row : r)) : [row, ...list]
    })
    return row
  }, [qc])

  /* An answer logged on the wrong day, or against the wrong question, used to
     be permanent: the history list was read-only and re-answering only
     upserts TODAY's row. Soft delete, so it lands in the trash for 30 days
     like every other record — and so the correlation engine stops counting a
     value the user says never happened. Mirrors useGoalEntries.removeEntry,
     the twin history that already offered this. */
  const removeAnswer = useCallback(async (id) => {
    const row = (qc.getQueryData(KEY) ?? []).find((a) => a.id === id)
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((a) => a.id !== id))
    try {
      await apiRemove(id)
      registerDeleteUndo({ qc, key: KEY, row, label: i18n.t('components:undo.deleted.answer'), restoreFn: restoreDailyAnswer, deleteFn: apiRemove })
    } catch { revertWrite(qc, { queryKey: KEY }) }
  }, [qc])

  return { answers, loading: isLoading, unreachable: !!error || (fetchStatus === 'paused' && data === undefined), error: error?.message ?? null, addAnswer, removeAnswer, refetch }
}
