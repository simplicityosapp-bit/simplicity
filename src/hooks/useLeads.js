import { useCallback, useEffect, useState } from 'react'
import { listLeads, insertLead, updateLead as apiUpdateLead, removeLead as apiRemoveLead } from '../lib/api/leads'

export function useLeads() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setLeads(await listLeads())
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
        const data = await listLeads()
        if (active) { setLeads(data); setError(null) }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const addLead = useCallback(async (payload) => {
    const row = await insertLead(payload)
    setLeads((prev) => [row, ...prev])
    return row
  }, [])

  const updateLead = useCallback(async (id, patch) => {
    const row = await apiUpdateLead(id, patch)
    setLeads((prev) => prev.map((l) => (l.id === id ? row : l)))
    return row
  }, [])

  const removeLead = useCallback(async (id) => {
    setLeads((prev) => prev.filter((l) => l.id !== id))
    try { await apiRemoveLead(id) } catch (e) { setError(e.message); refetch() }
  }, [refetch])

  return { leads, loading, error, addLead, updateLead, removeLead, refetch }
}
