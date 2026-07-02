import { useMemo } from 'react'
import { FolderOpen } from 'lucide-react'
import { isr } from '@simplicity/core'
import { useT } from '../../i18n/useT'
import { Box, Txt } from '../../components/ui'

/* Distribute the month's confirmed income across projects. A
   transaction belongs to its own project_id when set; otherwise we
   fall back to the client_id → client.project_id mapping so income
   recorded against a client (with no explicit project) still counts.
   "ללא פרויקט" captures the remainder. */
export default function IncomeByProject({ monthTxs, clients = [], projects = [] }) {
  const { t } = useT('finance')
  const rows = useMemo(() => {
    const clientProj = new Map(clients.filter((c) => c.project_id).map((c) => [c.id, c.project_id]))
    const totals = new Map() /* projectId | null → number */
    monthTxs.forEach((tx) => {
      if (tx.type !== 'income') return
      // Match the hero summary / net (sumConfirmed): exclude credited (cancelled
      // by a credit note) txs, else this breakdown overstates vs the total above.
      if (tx.status !== 'confirmed' || tx.invoice_credited_at) return
      const pid = tx.project_id || (tx.client_id ? clientProj.get(tx.client_id) : null) || null
      totals.set(pid, (totals.get(pid) || 0) + Number(tx.amount || 0))
    })
    const max = Math.max(0, ...totals.values())
    const out = []
    for (const [pid, sum] of totals) {
      if (!sum) continue
      const project = pid ? projects.find((p) => p.id === pid) : null
      out.push({
        id: pid || 'none',
        name: project?.name || t('incomeByProject.noProject'),
        color: project?.color || 'var(--stone)',
        sum,
        pct: max > 0 ? Math.round((sum / max) * 100) : 0,
      })
    }
    return out.sort((a, b) => b.sum - a.sum)
  }, [monthTxs, clients, projects, t])

  return (
    <Box as="section" className="f-breakdown">
      <Box className="f-breakdown-head">
        <Txt className="f-breakdown-title">
          <FolderOpen size={15} strokeWidth={1.5} aria-hidden="true" />
          {t('incomeByProject.title')}
        </Txt>
        {rows.length > 0 && <Txt className="f-breakdown-count mono">{rows.length}</Txt>}
      </Box>
      {rows.length === 0 ? (
        <Txt as="p" className="f-breakdown-empty">{t('incomeByProject.empty')}</Txt>
      ) : (
        <Box className="f-breakdown-list">
          {rows.map((r) => (
            <Box key={r.id} className="f-breakdown-row">
              <Box className="f-breakdown-row-head">
                <Txt className="f-breakdown-dot" style={{ background: r.color }} />
                <Txt className="f-breakdown-name">{r.name}</Txt>
                <Txt className="f-breakdown-amt mono">{isr(r.sum)}</Txt>
              </Box>
              <Box className="f-breakdown-bar">
                <Box className="f-breakdown-fill" style={{ width: `${r.pct}%`, background: r.color }} />
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
