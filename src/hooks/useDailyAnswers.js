import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listDailyAnswers, insertDailyAnswer } from '../lib/api/dailyAnswers'

/* React-Query-backed: shared across moon + insights widgets. Public API unchanged. */
const KEY = ['dailyAnswers']

export function useDailyAnswers() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listDailyAnswers })
  const answers = data ?? []

  const addAnswer = useCallback(async (payload) => {
    const row = await insertDailyAnswer(payload)
    qc.setQueryData(KEY, (prev) => [row, ...(prev ?? [])])
    return row
  }, [qc])

  return { answers, loading: isLoading, error: error?.message ?? null, addAnswer, refetch }
}
