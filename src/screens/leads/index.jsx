import { useMemo, useState } from 'react'
import { Leaf, ArrowLeft, TrendingUp } from 'lucide-react'
import { useLeads } from '../../hooks/useLeads'
import { useLeadSources } from '../../hooks/useLeadSources'
import { useLeadStatuses } from '../../hooks/useLeadStatuses'
import { LEAD_META, statusMetaOfLead, metaColor } from '../../lib/leads'
import LeadColumn from './LeadColumn'
import AddLeadModal from '../../modals/AddLeadModal'
import EditLeadModal from '../../modals/EditLeadModal'
import './LeadsScreen.css'

function computeStats(list, now = new Date()) {
  const inMonth = (d) => {
    if (!d) return false
    const x = new Date(d)
    return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth()
  }
  const newThis = list.filter((l) => (l.inquiry_date ? inMonth(l.inquiry_date) : inMonth(l.created_at)))
  const convertedThisMonth = list.filter((l) => l.converted_at && inMonth(l.converted_at)).length
  const cohortConverted = newThis.filter((l) => !!l.converted_at).length
  const convRate = newThis.length ? Math.round((cohortConverted / newThis.length) * 100) : null
  return { newThisMonth: newThis.length, convertedThisMonth, convRate }
}

export default function LeadsScreen() {
  const { leads: leadList, loading, addLead, updateLead } = useLeads()
  const { sources } = useLeadSources()
  const { statuses: leadStatuses } = useLeadStatuses()
  const [showAdd, setShowAdd] = useState(false)
  const [editLead, setEditLead] = useState(null)

  const buckets = useMemo(() => {
    const g = {}
    LEAD_META.forEach((m) => { g[m.key] = [] })
    leadList.forEach((l) => { (g[statusMetaOfLead(l)] || g.in_process).push(l) })
    return g
  }, [leadList])
  const stats = useMemo(() => computeStats(leadList), [leadList])
  const total = LEAD_META.reduce((s, m) => s + (buckets[m.key]?.length || 0), 0)

  return (
    <div className="screen">
      <div className="screen-top">
        <header className="screen-head">
          <div>
            <div className="screen-head-meta">
              <p className="lbl">{total} לידים</p>
              <span className="lbl dot">·</span>
              <p className="lbl">קנבן</p>
            </div>
            <p className="lbl-sm">טיפוח קשרים מוביל לתוצאות.</p>
          </div>
          <p className="t-screen">לידים</p>
        </header>
        <button className="cta-add" type="button" aria-label="ליד חדש" onClick={() => setShowAdd(true)}>ליד חדש +</button>
      </div>

      <div className="l-stats">
        <div className="l-stat">
          <span className="l-stat-icon"><Leaf size={16} strokeWidth={1.6} aria-hidden="true" /></span>
          <div>
            <p className="l-stat-num mono">{stats.newThisMonth}</p>
            <p className="l-stat-lbl">פניות החודש</p>
          </div>
        </div>
        <div className="l-stat">
          <span className="l-stat-icon"><ArrowLeft size={16} strokeWidth={1.6} aria-hidden="true" /></span>
          <div>
            <p className="l-stat-num mono">{stats.convertedThisMonth}</p>
            <p className="l-stat-lbl">הומרו ללקוחות</p>
          </div>
        </div>
        <div className="l-stat">
          <span className="l-stat-icon"><TrendingUp size={16} strokeWidth={1.6} aria-hidden="true" /></span>
          <div>
            <p className="l-stat-num mono">{stats.convRate === null ? '—' : `${stats.convRate}%`}</p>
            <p className="l-stat-lbl">אחוז המרה</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="empty"><p className="empty-text">טוען לידים…</p></div>
      ) : (
        <div className="lead-board">
          {LEAD_META.map((m) => (
            <LeadColumn key={m.key} title={m.title} color={metaColor(m.key)} leads={buckets[m.key] || []} onEdit={setEditLead} sources={sources} statuses={leadStatuses} />
          ))}
        </div>
      )}

      <AddLeadModal open={showAdd} onClose={() => setShowAdd(false)} sources={sources} statuses={leadStatuses} onSave={addLead} />
      <EditLeadModal
        key={editLead?.id}
        open={!!editLead}
        onClose={() => setEditLead(null)}
        lead={editLead}
        statuses={leadStatuses}
        onSave={updateLead}
      />
    </div>
  )
}
