import { useCallback, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Leaf, ArrowLeft, TrendingUp, ChevronLeft, Bell, SlidersHorizontal, Search, Magnet, UserPlus } from 'lucide-react'
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
import { LEAD_META, metaTitle, statusMetaOfLead, metaColor, isConvertedLead, isPendingReview, toLocalDate } from '@simplicity/core'
import PendingLeadsSection from './PendingLeadsSection'
import { matchLead, leadLookups } from './matchLead'
import { pushUndo } from '../../lib/undo'
import LeadColumn from './LeadColumn'
import LeadStatusesPanel from './LeadStatusesPanel'
import LeadSourcesModal from '../../modals/LeadSourcesModal'
import AddLeadModal from '../../modals/AddLeadModal'
import EditLeadModal from '../../modals/EditLeadModal'
import ConvertLeadModal from '../../modals/ConvertLeadModal'
import FollowupsModal from '../../modals/FollowupsModal'
import LeadFollowupModal from '../../modals/LeadFollowupModal'
import LeadsFilterModal from '../../modals/LeadsFilterModal'
import ConfirmModal from '../../modals/ConfirmModal'
import Modal from '../../modals/Modal'
import Coachmark from '../../components/Coachmark'
import { useT } from '../../i18n/useT'
import './LeadsScreen.css'
import { Box, Txt, Btn, Input } from '../../components/ui'

const DEFAULT_LEADS_FILTER = { period: 'all', project: '', group: '', status: '', source: '', sort: '' }

function computeStats(list, now = new Date()) {
  /* toLocalDate, not new Date: leads.inquiry_date is a DATE column, so it
     arrives as 'YYYY-MM-DD' and `new Date()` reads it as UTC midnight while
     the getters below read local — west of Greenwich a lead from the 1st
     lands in the previous month. converted_at is a timestamptz and is
     unaffected either way; toLocalDate passes it through untouched. */
  const inMonth = (d) => {
    if (!d) return false
    const x = toLocalDate(d)
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
  const location = useLocation()
  const { leads: leadList, loading, error, addLead, updateLead, removeLead } = useLeads()
  const { pages: leadPages } = useLeadPages()
  const { sources, addSource, updateSource, removeSource } = useLeadSources()
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
  /* Sort is deliberately NOT counted: it reorders the board, it doesn't hide
     anything, and badging the filter button for it made the screen claim a
     lead was being filtered out when none was. */
  const activeFilterCount = (leadsFilter.period !== 'all' ? 1 : 0)
    + (leadsFilter.project ? 1 : 0) + (leadsFilter.group ? 1 : 0)
    + (effectiveStatus ? 1 : 0) + (leadsFilter.source ? 1 : 0)
  const [showFilter, setShowFilter] = useState(false)
  /* Free-text search across the board (the column counts + total update with
     it). Matches on everything the card actually shows — name, phone, email,
     notes, source, project — not just the name; see matchLead. */
  const [query, setQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editLead, setEditLead] = useState(null)
  /* Deep-open: a caller (the project screen's leads section) passes `openLeadId`
     in nav state to land on THAT lead instead of on the board — tapping a named
     lead there used to drop the user on the full kanban to find the name again
     by eye. Seeded once, then DERIVED rather than written into state from an
     effect: useLeads may not have arrived on the first render, and the lead
     simply resolves on the render where it does. Same shape the page builder
     uses for `editPageId` (site-pages/Builder.jsx). */
  const [deepLinkLeadId, setDeepLinkLeadId] = useState(location.state?.openLeadId || null)
  const openLead = editLead
    || (deepLinkLeadId ? leadList.find((l) => l.id === deepLinkLeadId) || null : null)
  /* Closing has to clear BOTH, or the deep link would re-derive it straight
     back open on the next render. */
  const closeLead = useCallback(() => { setEditLead(null); setDeepLinkLeadId(null) }, [])
  const [convertLead, setConvertLead] = useState(null)
  const [pendingDeleteLead, setPendingDeleteLead] = useState(null)
  const [followupLead, setFollowupLead] = useState(null)
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
  /* From the card. Not swallowed like the one above: the modal shows the
     failure and keeps the choice on screen rather than closing on a lie. */
  const setFollowup = (date) => updateLead(followupLead.id, { follow_up_date: date || null })

  const buckets = useMemo(() => {
    const f = leadsFilter
    const now = new Date()
    const inPeriod = (l) => {
      if (!f.period || f.period === 'all') return true
      const raw = l.inquiry_date || l.created_at
      if (!raw) return false
      /* Same reason as computeStats: inquiry_date is date-only. */
      const d = toLocalDate(raw)
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
    const lookups = leadLookups({ sources, projects })
    const g = {}
    LEAD_META.forEach((m) => { g[m.key] = [] })
    officialLeads
      .filter((l) => inPeriod(l)
        && matchLead(l, query, lookups)
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
  }, [officialLeads, leadsFilter, effectiveStatus, query, sources, projects])
  const stats = useMemo(() => computeStats(officialLeads), [officialLeads])
  /* "Never had a lead" is a different situation from "the filter hides them
     all", and only the first deserves to take over the screen.
     pendingReview counts too: a page submission awaiting approval IS an
     enquiry, and it renders in its own card directly above — without this the
     screen would show that card and then announce "no enquiries here yet"
     underneath it. */
  const firstRun = !loading && !error
    && officialLeads.length === 0 && pendingReview.length === 0
    && query.trim() === '' && activeFilterCount === 0

  /* Approve = move into the official list; reject = soft-delete (undoable). */
  const approveLead = useCallback((id) => updateLead(id, { pending_review: false }).catch(() => {}), [updateLead])
  const rejectLead = useCallback((id) => removeLead(id), [removeLead])

  /* Commit a column move (+ optional sub-status). status_id is always set
     to a sub-status that BELONGS to the target column (or null) — this
     fixes stale sub-statuses that lingered from the old column.
     source='manual_drag' so the lead_status_log captures the transition. */
  const applyLeadMove = useCallback((leadId, newMeta, statusId) => {
    const lead = leadList.find((l) => l.id === leadId)
    const prev = lead
      ? { status_meta: lead.status_meta ?? null, status_id: lead.status_id ?? null, last_status_changed_at: lead.last_status_changed_at ?? null, converted_at: lead.converted_at ?? null, converted_to_client_id: lead.converted_to_client_id ?? null }
      : null
    const now = new Date().toISOString()
    const next = {
      status_meta: newMeta,
      status_id: statusId ?? null,
      last_status_changed_at: now,
      /* Moving OUT of "converted" clears the conversion stamp so the drag path
         matches EditLeadModal — analytics never see an orphaned converted_at. */
      ...(newMeta !== 'converted' ? { converted_at: null, converted_to_client_id: null } : {}),
      /* Moving IN stamps it. Without this the lead sat in the "converted"
         column while isConvertedLead() stayed false, so the stats card read 0,
         the conversion rate was wrong, and the card still offered "convert to
         client" on a lead already in that column. Re-entering a lead that was
         converted before keeps its ORIGINAL stamp — the conversion happened
         when it happened, and overwriting it would move the lead between
         months in the stats.
         converted_to_client_id is deliberately left alone: a drag does not
         create a client, and only ConvertLeadModal can honestly set that. */
      ...(newMeta === 'converted' && !lead?.converted_at ? { converted_at: now } : {}),
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
     none → move with no sub-status.

     "הפכו ללקוחות" skips the question entirely: a closed lead is described
     by its project, not by a sub-status (owner's call). Old accounts may
     still HAVE converted sub-statuses from before the rule — we just stop
     assigning new ones rather than rewriting anyone's data. */
  const handleDropLead = useCallback((leadId, newMeta) => {
    const lead = leadList.find((l) => l.id === leadId)
    if (!lead) return
    if (statusMetaOfLead(lead) === newMeta) return
    if (newMeta === 'converted') { applyLeadMove(leadId, newMeta, null); return }
    const subs = leadStatuses.filter((s) => s.meta_category === newMeta && !s.deleted_at)
    if (subs.length >= 2) { setDropPicker({ leadId, newMeta, subs }); return }
    applyLeadMove(leadId, newMeta, subs.length === 1 ? subs[0].id : null)
  }, [leadList, leadStatuses, applyLeadMove])

  /* Touch+mouse drag of a lead between meta columns (zone = meta key). */
  const leadDnd = usePointerDnd({ onDrop: handleDropLead })

  return (
    <Box className="screen l-screen">
      <Box className="screen-top">
        <Box as="header" className="screen-head">
          <Txt as="p" className="t-screen">
            <Magnet size={20} strokeWidth={1.6} aria-hidden="true" />
            {t('title')}
          </Txt>
        </Box>
        {/* Kanban only, deliberately: the other "view" is not another way to
            look at the leads, it is the panel that edits the status names. An
            "add lead" button has nothing to add there. */}
        {view === 'kanban' && (
          <Coachmark id="add-lead" radius="50%" satisfied={leadList.length > 0}>
            <Btn className="cta-add" type="button" aria-label={t('newLeadAria')} onClick={() => setShowAdd(true)}>{t('newLead')}</Btn>
          </Coachmark>
        )}
      </Box>

      {/* The toolbar used to hold four controls before any lead was visible:
          the view toggle, "lead sources", and a "landing pages" link that
          pointed at a retired route which only redirects to /pages — a screen
          already in the main nav. That one is gone; sources moved in beside
          the view toggle as a single settings affordance. */}
      <Box className="l-toolbar">
        <Box className="l-view-toggle" role="tablist" aria-label={t('viewToggleAria')}>
          {/* The pair declared role="tab" and aria-selected but named no panel,
              so a screen reader announced "tab, selected" over content it could
              not tie to the tab. Both point at the one region below, which is
              what actually swaps. */}
          <Btn
            type="button"
            id="lead-tab-kanban"
            className={`l-view-btn${view === 'kanban' ? ' on' : ''}`}
            onClick={() => setView('kanban')}
            role="tab"
            aria-selected={view === 'kanban'}
            aria-controls="lead-view-panel"
          >
            {t('tabLeads')}
          </Btn>
          <Btn
            type="button"
            id="lead-tab-statuses"
            className={`l-view-btn${view === 'statuses' ? ' on' : ''}`}
            onClick={() => setView('statuses')}
            role="tab"
            aria-selected={view === 'statuses'}
            aria-controls="lead-view-panel"
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
      </Box>

      <Box
        id="lead-view-panel"
        role="tabpanel"
        aria-labelledby={view === 'statuses' ? 'lead-tab-statuses' : 'lead-tab-kanban'}
      >
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
          {/* Pending submissions, the month's numbers and the follow-up banner
              all belong to the BOARD. They used to render above the view
              switch, so the "סטטוסים" taxonomy screen also showed lead
              statistics and a follow-up banner — a management screen wearing
              the board's furniture. */}
          <PendingLeadsSection
            pending={pendingReview}
            pages={leadPages}
            onApprove={approveLead}
            onReject={rejectLead}
          />

          {firstRun ? (
            /* Three empty columns, 0/0/— and a banner saying nothing is due
               read as a broken screen rather than a new one. Until there is a
               single lead, the screen is one invitation. */
            <Box className="mg-firstrun">
              <Txt as="p" className="mg-firstrun-title">{t('firstRun.title')}</Txt>
              <Txt as="p" className="mg-firstrun-sub">{t('firstRun.sub')}</Txt>
              <Btn type="button" className="empty-action" onClick={() => setShowAdd(true)}>
                <UserPlus size={18} strokeWidth={1.6} aria-hidden="true" /> {t('firstRun.addLead')}
              </Btn>
              {/* Where leads arrive on their own — the contextual home for the
                  link that used to sit unexplained in the toolbar. */}
              <Btn type="button" className="mg-firstrun-alt" onClick={() => navigate(ROUTES.SITE_PAGES)}>
                {t('firstRun.pagesLink')}
              </Btn>
            </Box>
          ) : (
          <>
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

          {/* Only when something is actually due. A permanent 48px row saying
              "nothing to do today" is furniture, not information — the same
              call already made for the pending-leads section above it. */}
          {dueFollowups.length > 0 && (
            <Btn
              type="button"
              className="l-followup-banner"
              onClick={() => setShowFollowups(true)}
            >
              <Bell size={15} strokeWidth={1.8} aria-hidden="true" />
              <Txt className="l-followup-count mono">{dueFollowups.length}</Txt>
              <Txt className="l-followup-text">{t('followups.due')}</Txt>
              <ChevronLeft size={15} strokeWidth={1.7} className="l-followup-chev" aria-hidden="true" />
            </Btn>
          )}

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
              onFollowup={setFollowupLead}
              dnd={leadDnd}
              sources={sources}
              statuses={leadStatuses}
            />
          ))}
          </Box>
          </>
          )}
        </>
      )}
      </Box>

      <LeadSourcesModal
        open={showSources}
        onClose={() => setShowSources(false)}
        sources={sources}
        onAdd={addSource}
        onUpdate={updateSource}
        onRemove={removeSource}
      />
      <AddLeadModal open={showAdd} onClose={() => setShowAdd(false)} sources={sources} statuses={leadStatuses} projects={projects} groups={groups} onAddSource={handleAddSource} onSave={addLead} />
      <EditLeadModal
        key={openLead?.id}
        open={!!openLead}
        onClose={closeLead}
        lead={openLead}
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
      <LeadFollowupModal
        open={!!followupLead}
        onClose={() => setFollowupLead(null)}
        lead={followupLead}
        onSave={setFollowup}
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
        /* RETURNS the promise, so ConfirmModal stays busy until the delete
           lands instead of closing the moment the click is handled — the shape
           the pending-reject confirm already uses. */
        onConfirm={() => (pendingDeleteLead ? removeLead(pendingDeleteLead.id) : undefined)}
      />

      <Modal
        open={!!dropPicker}
        onClose={() => setDropPicker(null)}
        title={t('dropPicker.title', { context: dropPicker?.newMeta })}
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
