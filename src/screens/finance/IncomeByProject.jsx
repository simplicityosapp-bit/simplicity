import { useMemo } from 'react'
import { FolderOpen } from 'lucide-react'
import { isr } from '../../lib/finance'

/* Distribute the month's confirmed income across projects. A
   transaction belongs to its own project_id when set; otherwise we
   fall back to the client_id → client.project_id mapping so income
   recorded against a client (with no explicit project) still counts.
   "ללא פרויקט" captures the remainder. */
export default function IncomeByProject({ monthTxs, clients = [], projects = [] }) {
  const rows = useMemo(() => {
    const clientProj = new Map(clients.filter((c) => c.project_id).map((c) => [c.id, c.project_id]))
    const totals = new Map() /* projectId | null → number */
    monthTxs.forEach((t) => {
      if (t.type !== 'income') return
      if (t.status !== 'confirmed') return
      const pid = t.project_id || (t.client_id ? clientProj.get(t.client_id) : null) || null
      totals.set(pid, (totals.get(pid) || 0) + Number(t.amount || 0))
    })
    const max = Math.max(0, ...totals.values())
    const out = []
    for (const [pid, sum] of totals) {
      if (!sum) continue
      const project = pid ? projects.find((p) => p.id === pid) : null
      out.push({
        id: pid || 'none',
        name: project?.name || 'ללא פרויקט',
        color: project?.color || 'var(--stone)',
        sum,
        pct: max > 0 ? Math.round((sum / max) * 100) : 0,
      })
    }
    return out.sort((a, b) => b.sum - a.sum)
  }, [monthTxs, clients, projects])

  return (
    <section className="f-breakdown">
      <div className="f-breakdown-head">
        <span className="f-breakdown-title">
          <FolderOpen size={15} strokeWidth={1.5} aria-hidden="true" />
          הכנסות לפי פרויקט
        </span>
        {rows.length > 0 && <span className="f-breakdown-count mono">{rows.length}</span>}
      </div>
      {rows.length === 0 ? (
        <p className="f-breakdown-empty">אין הכנסות מסווגות החודש.</p>
      ) : (
        <div className="f-breakdown-list">
          {rows.map((r) => (
            <div key={r.id} className="f-breakdown-row">
              <div className="f-breakdown-row-head">
                <span className="f-breakdown-dot" style={{ background: r.color }} />
                <span className="f-breakdown-name">{r.name}</span>
                <span className="f-breakdown-amt mono">{isr(r.sum)}</span>
              </div>
              <div className="f-breakdown-bar">
                <div className="f-breakdown-fill" style={{ width: `${r.pct}%`, background: r.color }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
