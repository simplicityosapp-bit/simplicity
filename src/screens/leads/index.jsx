import { useCallback, useMemo, useState } from 'react'
import { Leaf, ArrowLeft, TrendingUp, ChevronLeft, Bell, ArrowUpDown } from 'lucide-react'
import { useLeads } from '../../hooks/useLeads'
import { useLeadSources } from '../../hooks/useLeadSources'
import { useLeadStatuses } from '../../hooks/useLeadStatuses'
import { useClients } from '../../hooks/useClients'
import { useProjects } from '../../hooks/useProjects'
import { useGroups } from '../../hooks/useGroups'
import { useGroupMembers } from '../../hooks/useGroupMembers'
import { CATEGORY_COLORS } from '../../lib/api/categories'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { usePointerDnd } from '../../hooks/usePointerDnd'
import { LEAD_META, statusMetaOfLead, metaColor, isConvertedLead } from '../../lib/leads'
import { pushUndo } from '../../lib/undo'
import LeadColumn from './LeadColumn'
import LeadStatusesPanel from './LeadStatusesPanel'
import LeadSourcesModal from '../../modals/LeadSourcesModal'
import AddLeadModal from '../../modals/AddLeadModal'
import EditLeadModal from '../../modals/EditLeadModal'
import ConvertLeadModal from '../../modals/ConvertLeadModal'
import FollowupsModal from '../../modals/FollowupsModal'
import ConfirmModal from '../../modals/ConfirmModal'
import Modal from '../../modals/Modal'
import Coachmark from '../../components/Coachmark'
import { useT } from '../../i18n/useT'
import './LeadsScreen.css'

function computeStats(list, now = new Date()) {
  const inMonth = (d) => {
    if (!d) return false
    const x = new Date(d)
    return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth()
  }
  const newThis = list.filter((l) => (l.inquiry_date ? inMonth(l.inquiry_date) : inMonth(l.created_at)))
  const convertedThisMonth = list.filter((l) => isConvertedLead(l) && inMonth(l.converted_at)).length
  const cohortConverted = newThis.filter(isConvertedLead).length
  const convRate = newThis.length ? Math.round((cohortConverted / newThis.length) * 100) : null
  return { newThisMonth: newThis.length, convertedThisMonth, convRate }
}

export default function LeadsScreen() {
  const { t } = useT('leads')
  const { leads: leadList, loading, error, addLead, updateLead, removeLead } = useLeads()
  const { sources, addSource, removeSource } = useLeadSources()
  const [showSources, setShowSources] = useState(false)
  const { statuses: leadStatuses, loading: statusesLoading, addStatus: addLeadStatus, updateStatus: updateLeadStatus, removeStatus: removeLeadStatus } = useLeadStatuses()
  const { addClient } = useClients()
  const { projects } = useProjects()
  const { groups } = useGroups()
  const { addMember } = useGroupMembers()
  /* Inline source creation from the lead modals — new sources take the first
     palette color (recolorable later in Settings → lead settings). */
  const handleAddSource = useCallback((name) => addSource({ name: name.trim(), color: CATEGORY_COLORS[0] }), [addSource])
  const { prefs, update: updatePrefs } = useUserPreferences()
  const view = prefs?.leadsView === 'statuses' ? 'statuses' : 'kanban'
  const setView = (v) => updatePrefs?.({ leadsView: v })
  /* Kanban sub-status filter + date sort (persisted, like the view choice).
     subFilter = a status_id ('' = all); dateSort = '' | 'new' | 'old'. */
  /* If the sub-status we're filtering by was deleted, fall back to "all" so the
     kanban doesn't stay filtered with no visible active chip. While statuses are
     still loading we keep the stored value so an active filter doesn't flash. */
  const rawSubFilter = prefs?.leadsSubFilter || ''
  const subFilter = (rawSubFilter && (statusesLoading || leadStatuses.some((s) => s.id === rawSubFilter))) ? rawSubFilter : ''
  const dateSort = prefs?.leadsSort || ''
  const setSubFilter = (v) => updatePrefs?.({ leadsSubFilter: v })
  const cycleSort = () => updatePrefs?.({ leadsSort: dateSort === '' ? 'new' : dateSort === 'new' ? 'old' : '' })
  const sortLabel = dateSort === 'new' ? t('sort.newOld') : dateSort === 'old' ? t('sort.oldNew') : t('sort.byDate')
  const [showAdd, setShowAdd] = useState(false)
  const [editLead, setEditLead] = useState(null)
  const [convertLead, setConvertLead] = useState(null)
  const [pendingDeleteLead, setPendingDeleteLead] = useState(null)
  const [dropPicker, setDropPicker] = useState(null) // { leadId, newMeta, subs }
  const [showFollowups, setShowFollowups] = useState(false)

  /* Open lead follow-ups — date ≤ today AND still in_process (a closed lead's
     follow-up is moot). Drives the banner + the follow-ups panel. */
  const dueFollowups = useMemo(() => {
    const t = new Date()
    const ymd = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    return (leadList || []).filter(
      (l) => !l.deleted_at && l.status_meta === 'in_process' && l.follow_up_date && String(l.follow_up_date).slice(0, 10) <= ymd,
    )
  }, [leadList])
  const markFollowupDone = (lead) => updateLead(lead.id, { follow_up_date: null }).catch(() => {})

  const buckets = useMemo(() => {
    const g = {}
    LEAD_META.forEach((m) => { g[m.key] = [] })
    const src = subFilter ? leadList.filter((l) => l.status_id === subFilter) : leadList
    src.forEach((l) => { (g[statusMetaOfLead(l)] || g.in_process).push(l) })
    if (dateSort) {
      const dir = dateSort === 'old' ? 1 : -1
      const keyOf = (l) => String(l.inquiry_date || l.created_at || '')
      LEAD_META.forEach((m) => { g[m.key].sort((a, b) => keyOf(a).localeCompare(keyOf(b)) * dir) })
    }
    return g
  }, [leadList, subFilter, dateSort])
  const stats = useMemo(() => computeStats(leadList), [leadList])
  const total = LEAD_META.reduce((s, m) => s + (buckets[m.key]?.length || 0), 0)

  /* Commit a column move (+ optional sub-status). status_id is always set
     to a sub-status that BELONGS to the target column (or null) — this
     fixes stale sub-statuses that lingered from the old column.
     source='manual_drag' so the lead_status_log captures the transition. */
  const applyLeadMove = useCallback((leadId, newMeta, statusId) => {
    const lead = leadList.find((l) => l.id === leadId)
    const prev = lead
      ? { status_meta: lead.status_meta ?? null, status_id: lead.status_id ?? null, last_status_changed_at: lead.last_status_changed_at ?? null }
      : null
    const next = {
      status_meta: newMeta,
      status_id: statusId ?? null,
      last_status_changed_at: new Date().toISOString(),
    }
    updateLead(leadId, next, { source: 'manual_drag' })
      .then(() => {
        if (prev) {
          pushUndo({
            label: t('undoStatusChanged'),
            undo: async () => { await updateLead(leadId, prev, { source: 'manual_drag' }).catch(() => {}) },
            redo: async () => { await updateLead(leadId, next, { source: 'manual_drag' }).catch(() => {}) },
          })
        }
      })
      .catch(() => { /* error surfaces via useLeads state */ })
  }, [leadList, updateLead])

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

  /* Touch+mouse drag of a lead between meta columns (zone = meta key). */
  const leadDnd = usePointerDnd({ onDrop: handleDropLead })

  return (
    <div className="screen">
      <div className="screen-top">
        <header className="screen-head">
          <div>
            <div className="screen-head-meta">
              <p className="lbl">{t('countLabel', { count: total })}</p>
              <span className="lbl dot">·</span>
              <p className="lbl">{view === 'statuses' ? t('tabStatuses') : t('tabLeads')}</p>
            </div>
            <p className="lbl-sm">{t('tagline')}</p>
          </div>
          <p className="t-screen">{t('title')}</p>
        </header>
        {view === 'kanban' && (
          <Coachmark id="add-lead" radius="50%">
            <button className="cta-add" type="button" aria-label={t('newLeadAria')} onClick={() => setShowAdd(true)}>{t('newLead')}</button>
          </Coachmark>
        )}
      </div>

      <div className="l-toolbar">
      <div className="l-view-toggle" role="tablist" aria-label={t('viewToggleAria')}>
        <button
          type="button"
          className={`l-view-btn${view === 'kanban' ? ' on' : ''}`}
          onClick={() => setView('kanban')}
          role="tab"
          aria-selected={view === 'kanban'}
        >
          {t('tabLeads')}
        </button>
        <button
          type="button"
          className={`l-view-btn${view === 'statuses' ? ' on' : ''}`}
          onClick={() => setView('statuses')}
          role="tab"
          aria-selected={view === 'statuses'}
        >
          {t('tabStatuses')}
        </button>
      </div>
        <button
          type="button"
          className="l-sources-link"
          onClick={() => setShowSources(true)}
        >
          <Leaf size={14} strokeWidth={1.7} aria-hidden="true" />
          {t('sourcesLink')}
        </button>
      </div>

      <div className="l-stats">
        <div className="l-stat">
          <span className="l-stat-icon"><Leaf size={16} strokeWidth={1.6} aria-hidden="true" /></span>
          <div>
            <p className="l-stat-num mono">{stats.newThisMonth}</p>
            <p className="l-stat-lbl">{t('stats.newThisMonth')}</p>
          </div>
        </div>
        <div className="l-stat">
          <span className="l-stat-icon"><ArrowLeft size={16} strokeWidth={1.6} aria-hidden="true" /></span>
          <div>
            <p className="l-stat-num mono">{stats.convertedThisMonth}</p>
            <p className="l-stat-lbl">{t('stats.converted')}</p>
          </div>
        </div>
        <div className="l-stat">
          <span className="l-stat-icon"><TrendingUp size={16} strokeWidth={1.6} aria-hidden="true" /></span>
          <div>
            <p className="l-stat-num mono">{stats.convRate === null ? '—' : `${stats.convRate}%`}</p>
            <p className="l-stat-lbl">{t('stats.convRate')}</p>
          </div>
        </div>
      </div>

      <button
        type="button"
        className={`l-followup-banner${dueFollowups.length === 0 ? ' muted' : ''}`}
        onClick={() => setShowFollowups(true)}
      >
        <Bell size={15} strokeWidth={1.8} aria-hidden="true" />
        {dueFollowups.length > 0 && <span className="l-followup-count mono">{dueFollowups.length}</span>}
        <span className="l-followup-text">
          {dueFollowups.length === 0 ? t('followups.empty') : t('followups.due')}
        </span>
        <ChevronLeft size={15} strokeWidth={1.7} className="l-followup-chev" aria-hidden="true" />
      </button>

      {loading ? (
        <div className="empty"><p className="empty-text">{t('loading')}</p></div>
      ) : error ? (
        <div className="empty"><p className="empty-text">{t('loadError', { error })}</p></div>
      ) : view === 'statuses' ? (
        <LeadStatusesPanel
          statuses={leadStatuses}
          onAdd={addLeadStatus}
          onUpdate={updateLeadStatus}
          onRemove={removeLeadStatus}
        />
      ) : (
        <>
          <div className="l-filterbar">
            <div className="l-subfilter" role="tablist" aria-label={t('subFilterAria')}>
              <button type="button" className={`l-subpill${!subFilter ? ' on' : ''}`} onClick={() => setSubFilter('')}>{t('all')}</button>
              {leadStatuses.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`l-subpill${subFilter === s.id ? ' on' : ''}`}
                  onClick={() => setSubFilter(subFilter === s.id ? '' : s.id)}
                >
                  <span className="l-subpill-dot" style={{ background: s.color || 'var(--stone)' }} />
                  {s.display_name}
                </button>
              ))}
            </div>
            <button type="button" className={`l-sort-btn${dateSort ? ' on' : ''}`} onClick={cycleSort} aria-label={t('sort.aria', { label: sortLabel })}>
              <ArrowUpDown size={14} strokeWidth={1.7} aria-hidden="true" />
              {sortLabel}
            </button>
          </div>
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
              dnd={leadDnd}
              sources={sources}
              statuses={leadStatuses}
            />
          ))}
          </div>
        </>
      )}

      <LeadSourcesModal
        open={showSources}
        onClose={() => setShowSources(false)}
        sources={sources}
        onAdd={addSource}
        onRemove={removeSource}
      />
      <AddLeadModal open={showAdd} onClose={() => setShowAdd(false)} sources={sources} statuses={leadStatuses} projects={projects} groups={groups} onAddSource={handleAddSource} onSave={addLead} />
      <EditLeadModal
        key={editLead?.id}
        open={!!editLead}
        onClose={() => setEditLead(null)}
        lead={editLead}
        statuses={leadStatuses}
        sources={sources}
        projects={projects}
        groups={groups}
        onAddSource={handleAddSource}
        onSave={updateLead}
      />
      <ConvertLeadModal
        key={convertLead?.id}
        open={!!convertLead}
        onClose={() => setConvertLead(null)}
        lead={convertLead}
        projects={projects}
        groups={groups}
        statuses={leadStatuses}
        onCreateClient={addClient}
        onUpdateLead={updateLead}
        onAddGroupMember={addMember}
      />
      <FollowupsModal
        open={showFollowups}
        onClose={() => setShowFollowups(false)}
        leads={dueFollowups}
        onOpenLead={(lead) => { setShowFollowups(false); setEditLead(lead) }}
        onMarkDone={markFollowupDone}
      />

      <ConfirmModal
        open={!!pendingDeleteLead}
        onClose={() => setPendingDeleteLead(null)}
        title={t('delete.title')}
        message={pendingDeleteLead ? t('delete.message', { name: pendingDeleteLead.name }) : ''}
        confirmLabel={t('delete.confirm')}
        danger
        onConfirm={() => { if (pendingDeleteLead) removeLead(pendingDeleteLead.id) }}
      />

      <Modal
        open={!!dropPicker}
        onClose={() => setDropPicker(null)}
        title={t('dropPicker.title')}
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
            {t('dropPicker.none')}
          </button>
        </div>
      </Modal>
    </div>
  )
}
