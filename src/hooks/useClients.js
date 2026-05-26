import { useCallback, useEffect, useState } from 'react'
import { listClients, insertClient, updateClient as apiUpdateClient, removeClient as apiRemoveClient } from '../lib/api/clients'

/* Loads the signed-in user's clients from Supabase and exposes CRUD.
   Optimistic for add/remove; refetch on error to resync. */
export function useClients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setClients(await listClients())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  /* Initial load — setState only happens after the await, so it isn't a
     synchronous effect-body update. */
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const data = await listClients()
        if (active) {
          setClients(data)
          setError(null)
        }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const addClient = useCallback(async (payload) => {
    const row = await insertClient(payload)
    setClients((prev) => [row, ...prev])
    return row
  }, [])

  const updateClient = useCallback(async (id, patch) => {
    const row = await apiUpdateClient(id, patch)
    setClients((prev) => prev.map((c) => (c.id === id ? row : c)))
    return row
  }, [])

  const removeClient = useCallback(
    async (id) => {
      setClients((prev) => prev.filter((c) => c.id !== id)) // optimistic
      try {
        await apiRemoveClient(id)
      } catch (e) {
        setError(e.message)
        refetch()
      }
    },
    [refetch],
  )

  return { clients, loading, error, addClient, updateClient, removeClient, refetch }
}
