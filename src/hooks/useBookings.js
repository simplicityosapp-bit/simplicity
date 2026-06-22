import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listBookings, confirmBooking as apiConfirm, rejectBooking as apiReject,
  materializeBooking as apiMaterialize,
} from '../lib/api/bookings'
import { showError } from '../lib/toast'

/* React-Query-backed owner view of bookings (pending review + confirmed).
   Shared by the attention widget + its confirm list. */
const KEY = ['bookings']
const byTime = (a, b) => new Date(a.starts_at) - new Date(b.starts_at)

export function useBookings() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listBookings })
  const bookings = data ?? []

  const replace = (row) => qc.setQueryData(KEY, (prev) => (prev ?? []).map((b) => (b.id === row.id ? row : b)).sort(byTime))

  const confirm = useCallback(async (booking) => {
    try {
      const row = await apiConfirm(booking)
      replace(row)
      return row
    } catch (e) { showError(e.message || 'אישור התור נכשל'); throw e }
  }, [qc]) // eslint-disable-line react-hooks/exhaustive-deps

  const reject = useCallback(async (id) => {
    try {
      const row = await apiReject(id)
      replace(row)
      return row
    } catch (e) { showError(e.message || 'דחיית התור נכשלה'); throw e }
  }, [qc]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Backfill an auto-confirmed booking with its lead + calendar event. */
  const materialize = useCallback(async (booking) => {
    const row = await apiMaterialize(booking)
    replace(row)
    return row
  }, [qc]) // eslint-disable-line react-hooks/exhaustive-deps

  return { bookings, loading: isLoading, error: error?.message ?? null, confirm, reject, materialize, refetch }
}
