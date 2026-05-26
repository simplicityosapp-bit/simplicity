import { useCallback, useEffect, useState } from 'react'
import { listGroupMembers, insertGroupMember, removeGroupMember as apiRemove } from '../lib/api/groupMembers'

export function useGroupMembers() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setMembers(await listGroupMembers())
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
        const data = await listGroupMembers()
        if (active) { setMembers(data); setError(null) }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const addMember = useCallback(async (payload) => {
    const row = await insertGroupMember(payload)
    setMembers((prev) => [row, ...prev])
    return row
  }, [])

  const removeMember = useCallback(async (id) => {
    setMembers((prev) => prev.filter((m) => m.id !== id))
    try { await apiRemove(id) } catch (e) { setError(e.message); refetch() }
  }, [refetch])

  return { members, loading, error, addMember, removeMember, refetch }
}
