import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { selectAll } from '../lib/paginate'
import { pushUndo } from '../lib/undo'
import { applyAdjustment, retractAdjustment } from '../lib/clientAdjustments'

// YYYY-MM-DD in LOCAL time — the column's DEFAULT CURRENT_DATE is UTC, which
// files an adjustment made in Israel after midnight under the previous day.
const localDateString = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/* The adjustment ledger (client_adjustments) and the two writes that keep it
   in step with the client's scalar columns — see lib/clientAdjustments for
   the ordering rules. The scalar is written straight to the table here, not
   through useClientsList.updateClient, whose fallback would insert a second
   row for the same change. `onChanged` refreshes whatever shows the client. */
export function useClientAdjustments({ onChanged } = {}) {
  const [adjustments, setAdjustments] = useState([])
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged

  const load = useCallback(async () => {
    try {
      const { data, error } = await selectAll(() => supabase.from('client_adjustments').select('*').is('deleted_at', null).order('created_at', { ascending: false }))
      if (!error) setAdjustments(data ?? [])
    } catch { /* the ledger is an explanation; the balance never depends on it */ }
  }, [])
  useEffect(() => { load() }, [load])

  const deps = useCallback(() => ({
    readScalar: async (clientId, column) => {
      const { data, error } = await supabase.from('clients').select(column).eq('id', clientId).single()
      if (error) throw error
      return data?.[column]
    },
    writeScalar: async (clientId, patch) => {
      const { error } = await supabase.from('clients').update(patch).eq('id', clientId)
      if (error) throw error
    },
    insertRow: async (row) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('no session')
      const { data, error } = await supabase.from('client_adjustments')
        .insert({ ...row, user_id: session.user.id, occurred_on: localDateString() }).select().single()
      if (error) throw error
      setAdjustments((prev) => [data, ...prev])
      return data
    },
    removeRow: async (id) => {
      const { error } = await supabase.from('client_adjustments').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      setAdjustments((prev) => prev.filter((a) => a.id !== id))
    },
    restoreRow: async (id) => {
      const { error } = await supabase.from('client_adjustments').update({ deleted_at: null }).eq('id', id)
      if (error) throw error
      load()
    },
    pushUndo,
    onChanged: () => onChangedRef.current?.(),
  }), [load])

  const addAdjustment = useCallback(
    (client, { kind, reason, amount, note, undoLabel }) => applyAdjustment({ client, kind, reason, amount, note, undoLabel, ...deps() }),
    [deps],
  )
  const removeAdjustment = useCallback(
    (client, adjustment, { undoLabel } = {}) => retractAdjustment({ client, adjustment, undoLabel, ...deps() }),
    [deps],
  )

  return { adjustments, refetch: load, addAdjustment, removeAdjustment }
}
