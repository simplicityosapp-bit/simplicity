import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Leaf, ArrowLeft, TrendingUp, ChevronLeft, Bell, SlidersHorizontal, Link2, Search } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { useLeads } from '../../hooks/useLeads'
import { useLeadPages } from '../../hooks/useLeadPages'
import { useLeadSources } from '../../hooks/useLeadSources'
import { useLeadStatuses } from '../../hooks/useLeadStatuses'
import { useClients } from '../../hooks/useClients'
import { useProjects } from '../../hooks/useProjects'
import { useGroups } from '../../hooks/useGroups'
import { useGroupMembers } from '../../hooks/useGroupMembers'
import { CATEGORY_COLORS } from '../../lib/api/categories'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { usePointerDnd } from '../../hooks/usePointerDnd'
import { LEAD_META, metaTitle, statusMetaOfLead, metaColor, isConvertedLead, isPendingReview } from '../../lib/leads'
import PendingLeadsSection from './PendingLeadsSection'
import { pushUndo } from '../../lib/undo'
import LeadColumn from './LeadColumn'
import LeadStatusesPanel from './LeadStatusesPanel'
import LeadSourcesModal from '../../modals/LeadSourcesModal'
import AddLeadModal from '../../modals/AddLeadModal'
import EditLeadModal from '../../modals/EditLeadModal'
import ConvertLeadModal from '../../modals/ConvertLeadModal'
import FollowupsModal from '../../modals/FollowupsModal'
import LeadsFilterModal from '../../modals/LeadsFilterModal'
import ConfirmModal from '../../modals/ConfirmModal'
import Modal from '../../modals/Modal'
import Coachmark from '../../components/Coachmark'
import { useT } from '../../i18n/useT'
import './LeadsScreen.css'
import { Box, Txt, Btn, Input } from '../../components/ui'

const DEFAULT_LEADS_FILTER = { period: 'all', project: '', group: '', status: '', source: '', sort: '' }

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
  const navigate = useNavigate()
  const { leads: leadList, loading, error, addLead, updateLead, removeLead } = useLeads()
  const { pages: leadPages } = useLeadPages()
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
  /* Consolidated leads-board filter (persisted in prefs.leadsFilter): period,
     project, group, sub-status, source, date-sort. Legacy prefs.leadsSubFilter /
     leadsSort seed the status/sort fields so existing users keep their active
     filter after the upgrade. Special select values: '' = all, '__none__' =
     unassigned. */
  const leadsFilter = useMemo(() => ({
    ...DEFAULT_LEADS_FILTER,
    status: prefs?.leadsSubFilter || '',
    sort: prefs?.leadsSort || '',
    ...(prefs?.leadsFilter || {}),
  }), [prefs?.leadsFilter, prefs?.leadsSubFilter, prefs?.leadsSort])
  /* If the sub-status we're filtering by was deleted, fall back to "all" so the
     board doesn't stay filtered with no matching status. While statuses are still
     loading we keep the stored value so an active filter doesn't flash. */
  const effectiveStatus = (leadsFilter.status && (statusesLoading || leadStatuses.some((s) => s.id === leadsFilter.status)))
    ? leadsFilter.status : ''
  const setLeadsFilter = (patch) => updatePrefs?.({ leadsFilter: { ...leadsFilter, ...patch } })
  /* Changing the project clears the group — a group only belongs inside it. */
  const handleFilterChange = (key, value) => (
    key === 'project' ? setLeadsFilter({ project: value, group: '' }) : setLeadsFilter({ [key]: value })
  )
  const clearLeadsFilter = () => updatePrefs?.({ leadsFilter: { ...DEFAULT_LEADS_FILTER } })
  const activeFilterCount = (leadsFilter.period !== 'all' ? 1 : 0)
    + (leadsFilter.project ? 1 : 0) + (leadsFilter.group ? 1 : 0)
    + (effectiveStatus ? 1 : 0) + (leadsFilter.source ? 1 : 0) + (leadsFilter.sort ? 1 : 0)
  const [showFilter, setShowFilter] = useState(false)
  /* Free-text name search — mirrors the clients screen; filters the board
     across all columns (the column counts + total update with it). */
  const [query, setQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editLead, setEditLead] = useState(null)
  const [convertLead, setConvertLead] = useState(null)
  const [pendingDeleteLead, setPendingDeleteLead] = useState(null)
  const [dropPicker, setDropPicker] = useState(null) // { leadId, newMeta, subs }
  const [showFollowups, setShowFollowups] = useState(false)

  /* Leads from public pages await manual approval (pending_review). They are
     kept OUT of the kanban, the stats, and the follow-ups — they live only in
     the review section + the home "דורש תשומת לב" widget until approved. */
  const pendingReview = useMemo(() => (leadList || []).filter(isPendingReview), [leadList])
  const officialLeads = useMemo(() => (leadList || []).filter((l) => !isPendingReview(l)), [leadList])

  /* Open lead follow-ups — date ≤ today AND still in_process (a closed lead's
     follow-up is moot). Drives the banner + the follow-ups panel. */
  const dueFollowups = useMemo(() => {
    const t = new Date()
    const ymd = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    return officialLeads.filter(
      (l) => !l.deleted_at && l.status_meta === 'in_process' && l.follow_up_date && String(l.follow_up_date).slice(0, 10) <= ymd,
    )
  }, [officialLeads])
  const markFollowupDone = (lead) => updateLead(lead.id, { follow_up_date: null }).catch(() => {})

  const buckets = useMemo(() => {
    const f = leadsFilter
    const now = new Date()
    const inPeriod = (l) => {
      if (!f.period || f.period === 'all') return true
      const raw = l.inquiry_date || l.created_at
      if (!raw) return false
      const d = new Date(raw)
      if (f.period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      if (f.period === 'last30') { const c = new Date(now); c.setDate(c.getDate() - 30); return d >= c }
      if (f.period === 'lastMonth') {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth()
      }
      return true
    }
    /* '' = all · '__none__' = unassigned (no id) · otherwise exact id match. */
    const matchRef = (val, sel) => (!sel ? true : sel === '__none__' ? !val : val === sel)
    const q = query.trim()
    const g = {}
    LEAD_META.forEach((m) => { g[m.key] = [] })
    officialLeads
      .filter((l) => inPeriod(l)
        && (!q || (l.name || '').includes(q))
        && matchRef(l.project_id, f.project)
        && matchRef(l.group_id, f.group)
        && matchRef(l.source_id, f.source)
        && (!effectiveStatus || l.status_id === effectiveStatus))
      .forEach((l) => { (g[statusMetaOfLead(l)] || g.in_process).push(l) })
    if (f.sort) {
      const dir = f.sort === 'old' ? 1 : -1
      const keyOf = (l) => String(l.inquiry_date || l.created_at || '')
      LEAD_META.forEach((m) => { g[m.key].sort((a, b) => keyOf(a).localeCompare(keyOf(b)) * dir) })
    }
    return g
  }, [officialLeads, leadsFilter, effectiveStatus, query])
  const stats = useMemo(() => computeStats(officialLeads), [officialLeads])

  /* Approve = move into the official list; reject = soft-delete (undoable). */
  const approveLead = useCallback((id) => updateLead(id, { pending_review: false }).catch(() => {}), [updateLead])
  const rejectLead = useCallback((id) => removeLead(id), [removeLead])
  const total = LEAD_META.reduce((s, m) => s + (buckets[m.key]?.length || 0), 0)

  /* Commit a column move (+ optional sub-status). status_id is always set
     to a sub-status that BELONGS to the target column (or null) — this
     fixes stale sub-statuses that lingered from the old column.
     source='manual_drag' so the lead_status_log captures the transition. */
  const applyLeadMove = useCallback((leadId, newMeta, statusId) => {
    const lead = leadList.find((l) => l.id === leadId)
    const prev = lead
      ? { status_meta: lead.status_meta ?? null, status_id: lead.status_id ?? null, last_status_changed_at: lead.last_status_changed_at ?? null, converted_at: lead.converted_at ?? null, converted_to_client_id: lead.converted_to_client_id ?? null }
      : null
    const next = {
      status_meta: newMeta,
      status_id: statusId ?? null,
      last_status_changed_at: new Date().toISOString(),
      /* Moving OUT of "converted" clears the conversion stamp so the drag path
         matches EditLeadModal — analytics never see an orphaned converted_at. */
      ...(newMeta !== 'converted' ? { converted_at: null, converted_to_client_id: null } : {}),
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
  }, [leadList, updateLead, t])

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
    <Box className="screen">
      <Box className="screen-top">
        <Box as="header" className="screen-head">
          <Box>
            <Box className="screen-head-meta">
              <Txt as="p" className="lbl">{t('countLabel', { count: total })}</Txt>
              <Txt className="lbl dot">·</Txt>
              <Txt as="p" className="lbl">{view === 'statuses' ? t('tabStatuses') : t('tabLeads')}</Txt>
            </Box>
            <Txt as="p" className="lbl-sm">{t('tagline')}</Txt>
          </Box>
          <Txt as="p" className="t-screen">{t('title')}</Txt>
        </Box>
        {view === 'kanban' && (
          <Coachmark id="add-lead" radius="50%">
            <Btn className="cta-add" type="button" aria-label={t('newLeadAria')} onClick={() => setShowAdd(true)}>{t('newLead')}</Btn>
          </Coachmark>
        )}
      </Box>

      <Box className="l-toolbar">
      <Box className="l-view-toggle" role="tablist" aria-label={t('viewToggleAria')}>
        <Btn
          type="button"
          className={`l-view-btn${view === 'kanban' ? ' on' : ''}`}
          onClick={() => setView('kanban')}
          role="tab"
          aria-selected={view === 'kanban'}
        >
          {t('tabLeads')}
        </Btn>
        <Btn
          type="button"
          className={`l-view-btn${view === 'statuses' ? ' on' : ''}`}
          onClick={() => setView('statuses')}
          role="tab"
          aria-selected={view === 'statuses'}
        >
          {t('tabStatuses')}
        </Btn>
      </Box>
        <Btn
          type="button"
          className="l-sources-link"
          onClick={() => setShowSources(true)}
        >
          <Leaf size={14} strokeWidth={1.7} aria-hidden="true" />
          {t('sourcesLink')}
        </Btn>
        <Btn
          type="button"
          className="l-sources-link"
          onClick={() => navigate(ROUTES.LEAD_PAGES)}
        >
          <Link2 size={14} strokeWidth={1.7} aria-hidden="true" />
          {t('leadPagesLink')}
        </Btn>
      </Box>

      <PendingLeadsSection
        pending={pendingReview}
        pages={leadPages}
        onApprove={approveLead}
        onReject={rejectLead}
      />

      <Box className="l-stats">
        <Box className="l-stat">
          <Txt className="l-stat-icon"><Leaf size={16} strokeWidth={1.6} aria-hidden="true" /></Txt>
          <Box>
            <Txt as="p" className="l-stat-num mono">{stats.newThisMonth}</Txt>
            <Txt as="p" className="l-stat-lbl">{t('stats.newThisMonth')}</Txt>
          </Box>
        </Box>
        <Box className="l-stat">
          <Txt className="l-stat-icon"><ArrowLeft size={16} strokeWidth={1.6} aria-hidden="true" /></Txt>
          <Box>
            <Txt as="p" className="l-stat-num mono">{stats.convertedThisMonth}</Txt>
            <Txt as="p" className="l-stat-lbl">{t('stats.converted')}</Txt>
          </Box>
        </Box>
        <Box className="l-stat">
          <Txt className="l-stat-icon"><TrendingUp size={16} strokeWidth={1.6} aria-hidden="true" /></Txt>
          <Box>
            <Txt as="p" className="l-stat-num mono">{stats.convRate === null ? '—' : `${stats.convRate}%`}</Txt>
            <Txt as="p" className="l-stat-lbl">{t('stats.convRate')}</Txt>
          </Box>
        </Box>
      </Box>

      <Btn
        type="button"
        className={`l-followup-banner${dueFollowups.length === 0 ? ' muted' : ''}`}
        onClick={() => setShowFollowups(true)}
      >
        <Bell size={15} strokeWidth={1.8} aria-hidden="true" />
        {dueFollowups.length > 0 && <Txt className="l-followup-count mono">{dueFollowups.length}</Txt>}
        <Txt className="l-followup-text">
          {dueFollowups.length === 0 ? t('followups.empty') : t('followups.due')}
        </Txt>
        <ChevronLeft size={15} strokeWidth={1.7} className="l-followup-chev" aria-hidden="true" />
      </Btn>

      {loading ? (
        <Box className="empty"><Txt as="p" className="empty-text">{t('loading')}</Txt></Box>
      ) : error ? (
        <Box className="empty"><Txt as="p" className="empty-text">{t('loadError', { error })}</Txt></Box>
      ) : view === 'statuses' ? (
        <LeadStatusesPanel
          statuses={leadStatuses}
          onAdd={addLeadStatus}
          onUpdate={updateLeadStatus}
          onRemove={removeLeadStatus}
        />
      ) : (
        <>
          <Box className="l-filterbar">
            <Box className="l-search">
              <Search size={16} strokeWidth={1.6} aria-hidden="true" />
              <Input
                type="search"
                placeholder={t('search')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </Box>
            <Btn
              type="button"
              className={`l-filter-btn${activeFilterCount ? ' on' : ''}`}
              onClick={() => setShowFilter(true)}
              aria-label={t('filter.btnAria')}
            >
              <SlidersHorizontal size={14} strokeWidth={1.7} aria-hidden="true" />
              {t('filter.btn')}
              {activeFilterCount > 0 && <Txt className="l-filter-count mono">{activeFilterCount}</Txt>}
            </Btn>
          </Box>
          <Box className="lead-board">
          {LEAD_META.map((m) => (
            <LeadColumn
              key={m.key}
              title={metaTitle(m.key)}
              color={metaColor(m.key, leadStatuses)}
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
          </Box>
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
      <LeadsFilterModal
        open={showFilter}
        onClose={() => setShowFilter(false)}
        filter={leadsFilter}
        onChange={handleFilterChange}
        onClear={clearLeadsFilter}
        projects={projects}
        groups={groups}
        statuses={leadStatuses}
        sources={sources}
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
        <Box className="lead-drop-picker">
          {(dropPicker?.subs || []).map((s) => (
            <Btn
              key={s.id}
              type="button"
              className="lead-drop-opt"
              onClick={() => { applyLeadMove(dropPicker.leadId, dropPicker.newMeta, s.id); setDropPicker(null) }}
            >
              <Txt className="lead-drop-dot" style={{ background: s.color || 'var(--stone)' }} aria-hidden="true" />
              <Txt>{s.icon ? `${s.icon} ` : ''}{s.display_name}</Txt>
            </Btn>
          ))}
          <Btn
            type="button"
            className="lead-drop-opt muted"
            onClick={() => { applyLeadMove(dropPicker.leadId, dropPicker.newMeta, null); setDropPicker(null) }}
          >
            {t('dropPicker.none')}
          </Btn>
        </Box>
      </Modal>
    </Box>
  )
}
