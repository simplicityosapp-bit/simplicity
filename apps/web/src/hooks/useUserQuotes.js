import { useCallback, useEffect, useState } from 'react'
import { listUserQuotes, insertUserQuote, removeUserQuote as apiRemove, restoreUserQuote } from '../lib/api/userQuotes'
import { pushUndo } from '../lib/undo'

/* Personal quotes pool (migration 0013). Loads once; add/remove update
   the local list optimistically and reconcile with the server row. */
export function useUserQuotes() {
  const [userQuotes, setUserQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const data = await listUserQuotes()
        if (active) { setUserQuotes(data || []); setError(null) }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const addUserQuote = useCallback(async (payload) => {
    const row = await insertUserQuote(payload)
    setUserQuotes((prev) => [row, ...prev])
    return row
  }, [])

  const removeUserQuote = useCallback(async (id) => {
    const row = userQuotes.find((q) => q.id === id)
    setUserQuotes((prev) => prev.filter((q) => q.id !== id))
    try {
      await apiRemove(id)
      if (row) pushUndo({
        label: 'הציטוט נמחק',
        undo: async () => {
          try { await restoreUserQuote(id) } catch (e) { setError(e.message); return }
          setUserQuotes((prev) => (prev.some((q) => q.id === id) ? prev : [row, ...prev]))
        },
        redo: async () => {
          setUserQuotes((prev) => prev.filter((q) => q.id !== id))
          try { await apiRemove(id) } catch (e) { setError(e.message) }
        },
      })
    } catch (e) { setError(e.message) }
  }, [userQuotes])

  return { userQuotes, loading, error, addUserQuote, removeUserQuote }
}
