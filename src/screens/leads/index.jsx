import { useCallback, useMemo, useState } from 'react'
import { Leaf, ArrowLeft, TrendingUp } from 'lucide-react'
import { useLeads } from '../../hooks/useLeads'
import { useLeadSources } from '../../hooks/useLeadSources'
import { useLeadStatuses } from '../../hooks/useLeadStatuses'
import { useClients } from '../../hooks/useClients'
import { useProjects } from '../../hooks/useProjects'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { LEAD_META, statusMetaOfLead, metaColor } from '../../lib/leads'
import LeadColumn from './LeadColumn'
import LeadStatusesPanel from './LeadStatusesPanel'
import AddLeadModal from '../../modals/AddLeadModal'
import EditLeadModal from '../../modals/EditLeadModal'
import ConvertLeadModal from '../../modals/ConvertLeadModal'
import ConfirmModal from '../../modals/ConfirmModal'
import Modal from '../../modals/Modal'
import Coachmark from '../../components/Coachmark'
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
  const { leads: leadList, loading, error, addLead, updateLead, removeLead } = useLeads()
  const { sources } = useLeadSources()
  const { statuses: leadStatuses, addStatus: addLeadStatus, removeStatus: removeLeadStatus } = useLeadStatuses()
  const { addClient } = useClients()
  const { projects } = useProjects()
  const { prefs, update: updatePrefs } = useUserPreferences()
  const view = prefs?.leadsView === 'statuses' ? 'statuses' : 'kanban'
  const setView = (v) => updatePrefs?.({ leadsView: v })
  const [showAdd, setShowAdd] = useState(false)
  const [editLead, setEditLead] = useState(null)
  const [convertLead, setConvertLead] = useState(null)
  const [pendingDeleteLead, setPendingDeleteLead] = useState(null)
  const [dropPicker, setDropPicker] = useState(null) // { leadId, newMeta, subs }

  const buckets = useMemo(() => {
    const g = {}
    LEAD_META.forEach((m) => { g[m.key] = [] })
    leadList.forEach((l) => { (g[statusMetaOfLead(l)] || g.in_process).push(l) })
    return g
  }, [leadList])
  const stats = useMemo(() => computeStats(leadList), [leadList])
  const total = LEAD_META.reduce((s, m) => s + (buckets[m.key]?.length || 0), 0)

  /* Commit a column move (+ optional sub-status). status_id is always set
     to a sub-status that BELONGS to the target column (or null) — this
     fixes stale sub-statuses that lingered from the old column.
     source='manual_drag' so the lead_status_log captures the transition. */
  const applyLeadMove = useCallback((leadId, newMeta, statusId) => {
    updateLead(
      leadId,
      {
        status_meta: newMeta,
        status_id: statusId ?? null,
        last_status_changed_at: new Date().toISOString(),
      },
      { source: 'manual_drag' },
    ).catch(() => { /* error surfaces via useLeads state */ })
  }, [updateLead])

  /* Drag-drop between meta columns. No-op on same column. If the target
     column has 2+ sub-statuses, ask which one; exactly 1 → auto-assign;
     none → move with no sub-status. */
  const handleDropLead = useCallback((leadId, newMeta) => {
    const lead = leadList.find((l) => l.id === leadId)
    if (!lead) return
    if (statusMetaOfLead(lead) === newMeta) return
    const subs = leadStatuses.filter((s) => s.meta_category === newMeta && !s.deleted_at)
    if (subs.length >= 2) { setDropPicker({ leadId, newMeta, subs }); return }
    applyLeadMove(leadId, newMeta, subs.length === 1 ? subs[0].id : null)
  }, [leadList, leadStatuses, applyLeadMove])

  return (
    <div className="screen">
      <div className="screen-top">
        <header className="screen-head">
          <div>
            <div className="screen-head-meta">
              <p className="lbl">{total} לידים</p>
              <span className="lbl dot">·</span>
              <p className="lbl">{view === 'statuses' ? 'סטטוסים' : 'קנבן'}</p>
            </div>
            <p className="lbl-sm">טיפוח קשרים מוביל לתוצאות.</p>
          </div>
          <p className="t-screen">לידים</p>
        </header>
        {view === 'kanban' && (
          <Coachmark id="add-lead" radius="50%">
            <button className="cta-add" type="button" aria-label="ליד חדש" onClick={() => setShowAdd(true)}>ליד חדש +</button>
          </Coachmark>
        )}
      </div>

      <div className="l-view-toggle" role="tablist" aria-label="תצוגה">
        <button
          type="button"
          className={`l-view-btn${view === 'kanban' ? ' on' : ''}`}
          onClick={() => setView('kanban')}
          role="tab"
          aria-selected={view === 'kanban'}
        >
          קנבן
        </button>
        <button
          type="button"
          className={`l-view-btn${view === 'statuses' ? ' on' : ''}`}
          onClick={() => setView('statuses')}
          role="tab"
          aria-selected={view === 'statuses'}
        >
          סטטוסים
        </button>
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
      ) : error ? (
        <div className="empty"><p className="empty-text">שגיאה בטעינת הלידים: {error}</p></div>
      ) : view === 'statuses' ? (
        <LeadStatusesPanel
          statuses={leadStatuses}
          onAdd={addLeadStatus}
          onRemove={removeLeadStatus}
        />
      ) : (
        <div className="lead-board">
          {LEAD_META.map((m) => (
            <LeadColumn
              key={m.key}
              title={m.title}
              color={metaColor(m.key)}
              metaKey={m.key}
              leads={buckets[m.key] || []}
              onEdit={setEditLead}
              onConvert={setConvertLead}
              onDelete={setPendingDeleteLead}
              onDropLead={handleDropLead}
              sources={sources}
              statuses={leadStatuses}
            />
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
      <ConvertLeadModal
        key={convertLead?.id}
        open={!!convertLead}
        onClose={() => setConvertLead(null)}
        lead={convertLead}
        projects={projects}
        statuses={leadStatuses}
        onCreateClient={addClient}
        onUpdateLead={updateLead}
      />

      <ConfirmModal
        open={!!pendingDeleteLead}
        onClose={() => setPendingDeleteLead(null)}
        title="מחיקת ליד"
        message={pendingDeleteLead ? `למחוק את "${pendingDeleteLead.name}"? הליד יעבור לזבל וניתן לשחזר אותו תוך 30 יום.` : ''}
        confirmLabel="מחק"
        danger
        onConfirm={() => { if (pendingDeleteLead) removeLead(pendingDeleteLead.id) }}
      />

      <Modal
        open={!!dropPicker}
        onClose={() => setDropPicker(null)}
        title="לאיזה תת-סטטוס לשייך?"
      >
        <div className="lead-drop-picker">
          {(dropPicker?.subs || []).map((s) => (
            <button
              key={s.id}
              type="button"
              className="lead-drop-opt"
              onClick={() => { applyLeadMove(dropPicker.leadId, dropPicker.newMeta, s.id); setDropPicker(null) }}
            >
              <span className="lead-drop-dot" style={{ background: s.color || 'var(--stone)' }} aria-hidden="true" />
              <span>{s.icon ? `${s.icon} ` : ''}{s.display_name}</span>
            </button>
          ))}
          <button
            type="button"
            className="lead-drop-opt muted"
            onClick={() => { applyLeadMove(dropPicker.leadId, dropPicker.newMeta, null); setDropPicker(null) }}
          >
            ללא תת-סטטוס
          </button>
        </div>
      </Modal>
    </div>
  )
}
