import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listMeetingTypes, insertMeetingType, updateMeetingType,
  removeMeetingType as apiRemove, restoreMeetingType, applyMeetingTypePrice,
} from '../lib/api/meetingTypes'
import { pushUndo } from '../lib/undo'

/* React-Query-backed: shared across the client add/edit forms, MeetingTypesModal,
   the calendar, booking-pages and the meeting-confirm list — one cache instead
   of a fetch per mount, so adding/repricing a type in one surface shows in the
   others immediately (previously each held an independent copy). Public API
   unchanged. */
const KEY = ['meetingTypes']

export function useMeetingTypes() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listMeetingTypes })
  const types = data ?? []

  const addType = useCallback(async (payload) => {
    const row = await insertMeetingType(payload)
    qc.setQueryData(KEY, (prev) => [...(prev ?? []), row])
    return row
  }, [qc])

  /* Update a type. When default_price changes, push it to every linked client
     that hasn't been manually overridden (live propagation). The caller passes
     onPriceApplied to refetch the clients list afterwards. */
  const updateType = useCallback(async (id, patch, onPriceApplied) => {
    const prev = (qc.getQueryData(KEY) ?? []).find((t) => t.id === id)
    try {
      const row = await updateMeetingType(id, patch)
      qc.setQueryData(KEY, (list) => (list ?? []).map((t) => (t.id === id ? row : t)))
      const priceChanged = patch.default_price !== undefined
        && Number(patch.default_price) !== Number(prev?.default_price)
      if (priceChanged && row.default_price != null) {
        await applyMeetingTypePrice(id, row.default_price)
        /* The price propagated to every linked client at the DB level — refresh
           the shared clients cache so the list / open drawer / Home / Finance
           re-derive balances at once. */
        qc.invalidateQueries({ queryKey: ['clients'] })
        await onPriceApplied?.()
      }
      return row
    } catch (e) {
      /* The type update or the price propagation failed — resync from source so
         the UI never shows a price that didn't propagate, then rethrow so the
         caller can surface it. */
      qc.invalidateQueries({ queryKey: KEY })
      throw e
    }
  }, [qc])

  const removeType = useCallback(async (id) => {
    const row = (qc.getQueryData(KEY) ?? []).find((t) => t.id === id)
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((t) => t.id !== id))
    try {
      await apiRemove(id)
      if (row) pushUndo({
        label: 'סוג הפגישה נמחק',
        undo: async () => { try { await restoreMeetingType(id) } finally { qc.invalidateQueries({ queryKey: KEY }) } },
        redo: async () => {
          qc.setQueryData(KEY, (prevList) => (prevList ?? []).filter((t) => t.id !== id))
          try { await apiRemove(id) } catch { qc.invalidateQueries({ queryKey: KEY }) }
        },
      })
    } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { types, loading: isLoading, error: error?.message ?? null, addType, updateType, removeType, refetch }
}
