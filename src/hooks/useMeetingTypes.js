import { useCallback, useEffect, useState } from 'react'
import {
  listMeetingTypes, insertMeetingType, updateMeetingType,
  removeMeetingType as apiRemove, restoreMeetingType, applyMeetingTypePrice,
} from '../lib/api/meetingTypes'
import { pushUndo } from '../lib/undo'

export function useMeetingTypes() {
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setTypes(await listMeetingTypes())
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
        const data = await listMeetingTypes()
        if (active) { setTypes(data); setError(null) }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const addType = useCallback(async (payload) => {
    const row = await insertMeetingType(payload)
    setTypes((prev) => [...prev, row])
    return row
  }, [])

  /* Update a type. When default_price changes, push it to every linked
     client that hasn't been manually overridden (live propagation). The
     caller passes onPriceApplied to refetch the clients list afterwards. */
  const updateType = useCallback(async (id, patch, onPriceApplied) => {
    const prev = types.find((t) => t.id === id)
    try {
      const row = await updateMeetingType(id, patch)
      setTypes((list) => list.map((t) => (t.id === id ? row : t)))
      const priceChanged = patch.default_price !== undefined
        && Number(patch.default_price) !== Number(prev?.default_price)
      if (priceChanged && row.default_price != null) {
        await applyMeetingTypePrice(id, row.default_price)
        await onPriceApplied?.()
      }
      return row
    } catch (e) {
      /* The type update or the price propagation to clients failed — resync
         from source so the UI never shows a price that didn't propagate. */
      setError(e.message)
      refetch()
      throw e
    }
  }, [types, refetch])

  const removeType = useCallback(async (id) => {
    const row = types.find((t) => t.id === id)
    setTypes((prev) => prev.filter((t) => t.id !== id))
    try {
      await apiRemove(id)
      if (row) pushUndo({
        label: 'סוג הפגישה נמחק',
        undo: async () => { try { await restoreMeetingType(id) } finally { refetch() } },
        redo: async () => {
          setTypes((prev) => prev.filter((t) => t.id !== id))
          try { await apiRemove(id) } catch (e) { setError(e.message); refetch() }
        },
      })
    } catch (e) { setError(e.message); refetch() }
  }, [types, refetch])

  return { types, loading, error, addType, updateType, removeType, refetch }
}
