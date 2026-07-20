import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listClientAdjustments, insertClientAdjustment, removeClientAdjustment } from '../lib/api/clientAdjustments'
import { updateClient } from '../lib/api/clients'
import { pushUndo } from '../lib/undo'

/* ════════════════════════════════════════════════════════════════
   useClientAdjustments — manual adjustments with a reason and a date
   (migration 0095).

   The scalar columns clients.paid_adjustment / balance_adjustment REMAIN
   the source of truth that clientBalance() reads (owner decision 20/07 —
   the money engine does not move). This hook is the one place that writes
   an adjustment, and it keeps the two in lockstep: move the scalar, then
   append the row that explains it.

   Order matters. The scalar is written FIRST: if the ledger insert then
   fails, the balance is still correct and only the explanation is missing
   — the safer way round, since a wrong balance is a real-money bug and a
   missing note is a cosmetic one.
   ════════════════════════════════════════════════════════════════ */

const KEY = ['client_adjustments']
/* Which client column each kind moves. */
const COLUMN = { paid: 'paid_adjustment', balance: 'balance_adjustment' }

export function useClientAdjustments() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({ queryKey: KEY, queryFn: listClientAdjustments })

  const refreshClients = useCallback(() => qc.invalidateQueries({ queryKey: ['clients'] }), [qc])

  /* `undoLabel` comes from the caller because the undo toast is user-facing
     copy and this hook has no translator. */
  const addAdjustment = useCallback(async (client, { kind, reason, amount, note = null, undoLabel = '' }) => {
    const delta = Number(amount) || 0
    const col = COLUMN[kind]
    if (!col || !client) throw new Error('invalid adjustment')
    const before = Number(client[col]) || 0
    await updateClient(client.id, { [col]: before + delta })
    refreshClients()
    /* The ledger write is deliberately NON-FATAL. Migrations here are applied
       by hand, so there is a window where this code is live and the table
       isn't. The scalar above — the number clientBalance actually reads — is
       already correct, so the adjustment stands and only its explanation is
       missing. Failing the user's action over a missing note would be the
       worse trade. */
    let row = null
    try {
      row = await insertClientAdjustment({
        client_id: client.id, kind, reason, amount: delta, note: note || null,
      })
      qc.setQueryData(KEY, (prev) => [row, ...(prev ?? [])])
    } catch { /* no ledger — the balance is still right */ }
    /* One-step undo, the way every other destructive-ish action in the app
       behaves — restores the exact prior scalar (not `- delta`, so a
       concurrent edit can't compound) and retires the row. */
    pushUndo({
      label: undoLabel,
      undo: async () => {
        await updateClient(client.id, { [col]: before }).catch(() => {})
        if (row) {
          await removeClientAdjustment(row.id).catch(() => {})
          qc.setQueryData(KEY, (prev) => (prev ?? []).filter((a) => a.id !== row.id))
        }
        refreshClients()
      },
      redo: async () => {
        await updateClient(client.id, { [col]: before + delta }).catch(() => {})
        qc.invalidateQueries({ queryKey: KEY })
        refreshClients()
      },
    })
    return row
  }, [qc, refreshClients])

  return { adjustments: data ?? [], loading: isLoading, error: error?.message || null, addAdjustment }
}
