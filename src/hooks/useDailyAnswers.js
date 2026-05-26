import { useCallback, useEffect, useState } from 'react'
import { listDailyAnswers, insertDailyAnswer } from '../lib/api/dailyAnswers'

export function useDailyAnswers() {
  const [answers, setAnswers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setAnswers(await listDailyAnswers())
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
        const data = await listDailyAnswers()
        if (active) { setAnswers(data); setError(null) }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const addAnswer = useCallback(async (payload) => {
    const row = await insertDailyAnswer(payload)
    setAnswers((prev) => [row, ...prev])
    return row
  }, [])

  return { answers, loading, error, addAnswer, refetch }
}
