import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Search, ArrowUpDown, X, UserPlus, Wallet, ChevronLeft, AlertTriangle } from 'lucide-react'
import { effectiveClientMeta, paidForClients, sessionsCountForClients, clientBalance } from '../../lib/clients'
import { currentMonthRange, isr, financeQuery } from '../../lib/finance'
import { useClients } from '../../hooks/useClients'
import { useProjects } from '../../hooks/useProjects'
import { useTransactions } from '../../hooks/useTransactions'
import { useTasks } from '../../hooks/useTasks'
import { useReminders } from '../../hooks/useReminders'
import { useSessions } from '../../hooks/useSessions'
import { useScheduledMeetings } from '../../hooks/useScheduledMeetings'
import { staleScheduledMeetingIds } from '../../lib/scheduledMeetings'
import { usePopoverSide } from '../../hooks/usePopoverSide'
import { useGroups } from '../../hooks/useGroups'
import { useGroupMembers } from '../../hooks/useGroupMembers'
import { useClientStatuses } from '../../hooks/useClientStatuses'
import { useCategories } from '../../hooks/useCategories'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useT } from '../../i18n/useT'
import ClientTabs from './ClientTabs'
import ClientCard from './ClientCard'
import ClientDrawer from '../../drawers/client/ClientDrawer'
import AddClientModal from '../../modals/AddClientModal'
import DeleteClientModal from '../../modals/DeleteClientModal'
import MG from '../../components/MG'
import { pushUndo } from '../../lib/undo'
import './ClientsScreen.css'

const HERO_LABEL_KEY = {
  active: 'hero.active',
  wandering: 'hero.wandering',
  past: 'hero.past',
  no_status: 'hero.noStatus',
}

const SORT_OPTIONS = [
  { k: 'name',     labelKey: 'sort.name' },
  { k: 'balance',  labelKey: 'sort.balance' },
  { k: 'paid',     labelKey: 'sort.paid' },
  { k: 'sessions', labelKey: 'sort.sessions' },
  { k: 'created',  labelKey: 'sort.created' },
  { k: 'oldest',   labelKey: 'sort.oldest' },
]
const BULK_META_OPTIONS = [
  { k: 'active',    labelKey: 'status.active' },
  { k: 'wandering', labelKey: 'status.wandering' },
  { k: 'past',      labelKey: 'status.past' },
  { k: 'no_status', labelKey: 'status.noStatus' },
]
const DEFAULT_SORT = { field: 'name', dir: 'asc' }

function sortClients(arr, sort, ctx) {
  const dir = sort.dir === 'desc' ? -1 : 1
  /* Balances/paid are precomputed once per data change into maps (see
     balanceByClient / paidByClient) — the comparator only does O(1) lookups,
     never re-scanning transactions per comparison. */
  const { balanceByClient, paidByClient } = ctx
  const bal = (c) => balanceByClient.get(c.id) || {}
  return [...arr].sort((a, b) => {
    let av, bv
    switch (sort.field) {
      case 'balance':
        return ((bal(a).balance || 0) - (bal(b).balance || 0)) * dir
      case 'sessions':
        return ((bal(a).sessionsPaid || 0) - (bal(b).sessionsPaid || 0)) * dir
      case 'paid':
        return ((paidByClient.get(a.id) || 0) - (paidByClient.get(b.id) || 0)) * dir
      case 'created':
        av = new Date(a.created_at || 0).getTime()
        bv = new Date(b.created_at || 0).getTime()
        return (av - bv) * dir
      case 'oldest':
        /* "Oldest first" is created ascending — independent of dir so the
           label "ותק (הכי ישן)" stays semantically correct. */
        av = new Date(a.created_at || 0).getTime()
        bv = new Date(b.created_at || 0).getTime()
        return av - bv
      case 'name':
      default:
        return (a.name || '').localeCompare(b.name || '', 'he') * dir
    }
  })
}

export default function ClientsScreen() {
  const { t } = useT('clients')
  const { clients: clientList, loading, error, addClient, updateClient, removeClient } = useClients()
  const { projects } = useProjects()
  const { transactions, addTransaction, editTransaction, removeTransaction, refetch, error: txError } = useTransactions()
  const { tasks, editTask } = useTasks()
  const { reminders, editReminder } = useReminders()
  const { sessions, addSession, updateSession, error: sessionsError } = useSessions()
  const { meetings, addMeeting, removeMeeting } = useScheduledMeetings()
  const { groups, error: groupsError } = useGroups()

  /* When a client's recurring slot changes or is cleared, drop the future
     pending meetings generated for the OLD slot so stale occurrences don't
     linger on the calendar (one-off meetings never matched the recurring slot,
     so they're left alone; past pending meetings are kept for confirming).
     Hard-delete is safe here — once the schedule changed, the generation engine
     won't recreate the old slot. Wraps updateClient as onUpdateClient. */
  const handleUpdateClient = async (id, patch) => {
    const prev = clientList.find((c) => c.id === id)
    const result = await updateClient(id, patch)
    if (prev && ('recurring_day' in patch || 'recurring_time' in patch)) {
      const stale = staleScheduledMeetingIds(
        'client', id,
        { day: prev.recurring_day, time: prev.recurring_time },
        { day: patch.recurring_day, time: patch.recurring_time },
        meetings,
      )
      for (const mid of stale) removeMeeting(mid).catch(() => {})
    }
    return result
  }
  const { members, updateMember, error: membersError } = useGroupMembers()
  const { statuses: clientStatuses } = useClientStatuses()
  const { categories } = useCategories()
  const { prefs, update: updatePrefs } = useUserPreferences()
  const [tab, setTab] = useState('active')
  /* "יתרה פתוחה" filter persists like the neighbouring sort/scope/groupBy. */
  const balanceOnly = !!prefs?.clientsBalanceOnly
  const setBalanceOnly = (v) => updatePrefs?.({ clientsBalanceOnly: v })
  const scope = prefs?.clientsScope === 'cumulative' ? 'cumulative' : 'monthly'
  const setScope = (s) => updatePrefs?.({ clientsScope: s })
  const groupBy = prefs?.clientsGroupBy === 'project' ? 'project' : 'status'
  const setGroupBy = (g) => updatePrefs?.({ clientsGroupBy: g })
  const [query, setQuery] = useState('')
  const { id: routeClientId } = useParams()
  const [openId, setOpenId] = useState(routeClientId || null)
  /* Deep-link to a specific client (e.g. from the project drawer): when the
     route param changes to an id, open it. Adjusted during render (not in an
     effect) to avoid a cascading set-state-in-effect. */
  const [prevRouteClientId, setPrevRouteClientId] = useState(routeClientId)
  if (routeClientId !== prevRouteClientId) {
    setPrevRouteClientId(routeClientId)
    if (routeClientId) setOpenId(routeClientId)
  }
  const [showAdd, setShowAdd] = useState(false)
  const [pendingDeleteClient, setPendingDeleteClient] = useState(null)
  const [pendingDeleteBatch, setPendingDeleteBatch] = useState(null)
  const [sortOpen, setSortOpen] = useState(false)
  const sortAnchorRef = useRef(null)
  const sortSide = usePopoverSide(sortAnchorRef, sortOpen)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkMetaOpen, setBulkMetaOpen] = useState(false)
  const bulkMetaAnchorRef = useRef(null)
  const bulkMetaSide = usePopoverSide(bulkMetaAnchorRef, bulkMetaOpen)
  const openClient = openId ? clientList.find((c) => c.id === openId) : null

  const sort = useMemo(() => ({ ...DEFAULT_SORT, ...(prefs?.clientsSort || {}) }), [prefs?.clientsSort])

  /* Precompute every client's balance + total-paid ONCE per data change, so the
     sort comparator, the balance filter, the hero totals and each card all read
     an O(1) map lookup instead of re-scanning the full transactions array per
     client (which was O(clients × transactions), re-run on every keystroke). */
  const balanceByClient = useMemo(() => {
    const m = new Map()
    clientList.forEach((c) => m.set(c.id, clientBalance(c, transactions, sessions, members, groups)))
    return m
  }, [clientList, transactions, sessions, members, groups])
  const paidByClient = useMemo(() => {
    const m = new Map()
    clientList.forEach((c) => m.set(c.id, financeQuery({ type: 'income', clientId: c.id, source: transactions }).reduce((s, f) => s + f.amount, 0)))
    return m
  }, [clientList, transactions])

  const byMeta = useMemo(() => {
    const g = { active: [], wandering: [], past: [], no_status: [] }
    clientList.forEach((c) => { (g[effectiveClientMeta(c, members, groups)] || g.no_status).push(c) })
    return g
  }, [clientList, members, groups])
  const counts = {
    active: byMeta.active.length,
    wandering: byMeta.wandering.length,
    past: byMeta.past.length,
    no_status: byMeta.no_status.length,
  }
  const total = counts.active + counts.wandering + counts.past + counts.no_status

  const tabClients = useMemo(() => byMeta[tab] || [], [byMeta, tab])
  /* Source list — when grouping by project, all live clients participate
     (so projects with mixed-meta clients still show); the tab filter applies
     only inside the status mode. */
  const sourceClients = groupBy === 'project' ? clientList : tabClients
  const list = useMemo(() => {
    const q = query.trim()
    let filtered = q ? sourceClients.filter((c) => (c.name || '').includes(q)) : sourceClients
    /* "יתרה פתוחה" filter — only clients who still owe (balance > 0). */
    if (balanceOnly) filtered = filtered.filter((c) => (balanceByClient.get(c.id)?.balance || 0) > 0)
    return sortClients(filtered, sort, { balanceByClient, paidByClient })
  }, [sourceClients, query, sort, balanceOnly, balanceByClient, paidByClient])

  /* How many clients in the current view still owe — shown on the filter pill. */
  const openBalanceCount = useMemo(
    () => sourceClients.filter((c) => (balanceByClient.get(c.id)?.balance || 0) > 0).length,
    [sourceClients, balanceByClient],
  )

  /* Project bucket lookup for the grouped view. Includes a "no project"
     bucket for clients with no project_id. */
  const grouped = useMemo(() => {
    if (groupBy !== 'project') return null
    const byProj = new Map()
    list.forEach((c) => {
      const k = c.project_id || '__none__'
      if (!byProj.has(k)) byProj.set(k, [])
      byProj.get(k).push(c)
    })
    /* Stable order: projects in the order they appear in `projects`, then "no project". */
    const ordered = []
    projects.forEach((p) => { if (byProj.has(p.id)) ordered.push({ project: p, clients: byProj.get(p.id) }) })
    if (byProj.has('__none__')) ordered.push({ project: null, clients: byProj.get('__none__') })
    return ordered
  }, [groupBy, list, projects])

  /* Close the sort popover when tapping outside. */
  useEffect(() => {
    if (!sortOpen) return
    const onDoc = (e) => {
      if (!sortAnchorRef.current?.contains(e.target)) setSortOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [sortOpen])

  /* Same dismissal for the bulk-meta popover inside the bulk action bar. */
  useEffect(() => {
    if (!bulkMetaOpen) return
    const onDoc = (e) => {
      if (!bulkMetaAnchorRef.current?.contains(e.target)) setBulkMetaOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [bulkMetaOpen])

  /* Clear selection when switching tabs or leaving select mode. Adjusted during
     render (not in an effect) to avoid a cascading set-state-in-effect. */
  const selScope = `${tab}|${selectMode}`
  const [prevSelScope, setPrevSelScope] = useState(selScope)
  if (selScope !== prevSelScope) {
    setPrevSelScope(selScope)
    setSelectedIds(new Set())
  }

  const setSort = (patch) => updatePrefs?.({ clientsSort: { ...sort, ...patch } })

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const selectedClients = useMemo(
    () => list.filter((c) => selectedIds.has(c.id)),
    [list, selectedIds],
  )

  const bulkChangeMeta = async (newMeta) => {
    setBulkMetaOpen(false)
    /* Snapshot each client's prior status so one Undo reverts them all. */
    const snapshots = selectedClients.map((c) => ({ id: c.id, status_meta: c.status_meta ?? null, status: c.status ?? null }))
    for (const c of selectedClients) {
      await updateClient(c.id, { status_meta: newMeta, status: newMeta }).catch(() => {})
    }
    setSelectedIds(new Set())
    setSelectMode(false)
    if (snapshots.length) {
      pushUndo({
        label: snapshots.length === 1 ? t('bulk.statusChanged') : t('bulk.statusChangedMany', { count: snapshots.length }),
        undo: async () => { for (const s of snapshots) await updateClient(s.id, { status_meta: s.status_meta, status: s.status }).catch(() => {}) },
        redo: async () => { for (const s of snapshots) await updateClient(s.id, { status_meta: newMeta, status: newMeta }).catch(() => {}) },
      })
    }
  }

  /* past/לשעבר + ללא-סטטוס rosters rarely pay/meet THIS month, so monthly
     reads ~₪0 there — they're always shown cumulatively (the toggle is
     locked on those tabs). */
  const scopeLocked = tab === 'past' || tab === 'no_status'
  const effScope = scopeLocked ? 'cumulative' : scope

  /* Hero — per tab. Monthly/cumulative affects פגישות + שולם; balance is always current. */
  const hero = useMemo(() => {
    const range = effScope === 'monthly' ? currentMonthRange() : {}
    const paid = paidForClients(tabClients, range, transactions)
    const balance = tabClients.reduce((s, c) => s + (balanceByClient.get(c.id)?.balance || 0), 0)
    if (tab === 'past' || tab === 'no_status') {
      return [
        { l: t('hero.clients'), v: tabClients.length },
        { l: t('hero.sessions'), v: sessionsCountForClients(tabClients, range, sessions, members, groups) },
        { l: t('hero.paid'), v: isr(paid) },
      ]
    }
    let sessionsLabel
    if (effScope === 'monthly') {
      sessionsLabel = String(sessionsCountForClients(tabClients, range, sessions, members, groups))
    } else {
      const done = tabClients.reduce((s, c) => s + (balanceByClient.get(c.id)?.sessionsPaid || 0), 0)
      const allot = tabClients.reduce((s, c) => s + (c.sessions || 0), 0)
      sessionsLabel = `${done}/${allot}`
    }
    return [
      { l: t('hero.sessions'), v: sessionsLabel },
      { l: t('hero.paid'), v: isr(paid) },
      { l: t('hero.openBalance'), v: isr(balance) },
    ]
  }, [tab, effScope, tabClients, transactions, sessions, members, groups, balanceByClient, t])

  /* Balances are derived from transactions/sessions/memberships. If the
     clients list loaded but any of those failed, the totals are partial —
     warn instead of silently showing wrong ₪0 (review finding #18). */
  const balanceDataError = !loading && !error && !!(txError || sessionsError || groupsError || membersError)

  return (
    <div className={`screen${selectMode ? ' has-bulk-bar' : ''}`}>
      <div className="screen-top">
        <header className="screen-head">
          <div>
            <div className="screen-head-meta">
              <p className="lbl">{t('countLabel', { count: total })}</p>
              <span className="lbl dot">·</span>
              <p className="lbl">{t('summary')}</p>
            </div>
            <p className="lbl-sm">{t('tagline')}</p>
          </div>
          <p className="t-screen">{t('title')}</p>
        </header>
        <button className="cta-add" type="button" aria-label={t('addClientAria')} onClick={() => setShowAdd(true)}>+ <MG word="client_new" /></button>
      </div>
      <div className="c-top-actions">
          <div className="c-sort-wrap" ref={sortAnchorRef}>
            <button
              type="button"
              className="c-sort-btn"
              onClick={() => setSortOpen((v) => !v)}
              aria-expanded={sortOpen}
              aria-label={t('sort.label')}
            >
              <ArrowUpDown size={14} strokeWidth={1.7} aria-hidden="true" /> {t('sort.label')}
            </button>
            {sortOpen && (
              <div className="c-sort-pop" role="menu" style={{ [sortSide]: 0 }}>
                <p className="c-sort-h">{t('sort.heading')}</p>
                {SORT_OPTIONS.map((o) => (
                  <button
                    key={o.k}
                    type="button"
                    className={`c-sort-opt${sort.field === o.k ? ' on' : ''}`}
                    onClick={() => setSort({ field: o.k })}
                  >
                    {t(o.labelKey)}
                  </button>
                ))}
                <div className="c-sort-divider" />
                <div className="c-sort-dir">
                  <button
                    type="button"
                    className={`c-sort-opt${sort.dir === 'asc' ? ' on' : ''}`}
                    onClick={() => setSort({ dir: 'asc' })}
                  >{t('sort.asc')}</button>
                  <button
                    type="button"
                    className={`c-sort-opt${sort.dir === 'desc' ? ' on' : ''}`}
                    onClick={() => setSort({ dir: 'desc' })}
                  >{t('sort.desc')}</button>
                </div>
              </div>
            )}
          </div>
          <div className="mg-toggle c-groupby" role="tablist" aria-label={t('groupBy.aria')}>
            <button
              type="button"
              className={`mg-toggle-btn${groupBy === 'status' ? ' on' : ''}`}
              onClick={() => setGroupBy('status')}
            >{t('groupBy.status')}</button>
            <button
              type="button"
              className={`mg-toggle-btn${groupBy === 'project' ? ' on' : ''}`}
              onClick={() => setGroupBy('project')}
            >{t('groupBy.project')}</button>
          </div>
          <button
            type="button"
            className={`c-select-btn${selectMode ? ' on' : ''}`}
            onClick={() => setSelectMode((v) => !v)}
          >
            {selectMode ? t('select.cancel') : t('select.enter')}
          </button>
        </div>

      {groupBy === 'status' && (
        <ClientTabs active={tab} counts={counts} showNoStatus={counts.no_status > 0} onChange={setTab} />
      )}

      <div className="c-search-row">
        <div className="c-search">
          <Search size={16} strokeWidth={1.6} aria-hidden="true" />
          <input
            type="search"
            placeholder={t('search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className={`c-bal-filter${balanceOnly ? ' on' : ''}`}
          onClick={() => setBalanceOnly(!balanceOnly)}
          aria-pressed={balanceOnly}
        >
          <Wallet size={13} strokeWidth={1.8} aria-hidden="true" />
          {t('balanceFilter')}{openBalanceCount > 0 ? ` · ${openBalanceCount}` : ''}
        </button>
      </div>

      {balanceDataError && (
        <div className="c-data-warning" role="status">
          <AlertTriangle size={15} strokeWidth={1.8} aria-hidden="true" />
          <span>{t('dataWarning')}</span>
        </div>
      )}

      {groupBy === 'status' && (
        <section className="c-hero">
          <div className="s-hero">
            <div className="mg-toggle" role="tablist" aria-label={t('hero.rangeLabel')}>
              <button type="button" className={`mg-toggle-btn${effScope === 'monthly' ? ' on' : ''}`} onClick={() => setScope('monthly')} disabled={scopeLocked}>{t('hero.monthly')}</button>
              <button type="button" className={`mg-toggle-btn${effScope === 'cumulative' ? ' on' : ''}`} onClick={() => setScope('cumulative')} disabled={scopeLocked}>{t('hero.cumulative')}</button>
            </div>
            <p className="c-hero-scope-note">
              {scopeLocked ? t('hero.scopePast') : (scope === 'monthly' ? t('hero.scopeThisMonth') : t('hero.scopeFromStart'))}
            </p>
            <p className="c-hero-title"><MG text={t(HERO_LABEL_KEY[tab])} /></p>
            <div className="c-hero-grid">
              {hero.map((s, i) => (
                <div key={s.l} className={`c-hero-stat${i === 1 ? ' divided' : ''}`}>
                  <p className="c-hero-stat-l">{s.l}</p>
                  <p className="c-hero-stat-v mono">{s.v}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="c-list">
        {loading ? (
          <div className="empty"><p className="empty-text">{t('loading')}</p></div>
        ) : error ? (
          <div className="empty"><p className="empty-text">{t('loadError', { error })}</p></div>
        ) : list.length === 0 ? (
          query ? (
            <div className="empty"><p className="empty-text">{t('empty.noSearchResults')}</p></div>
          ) : total === 0 ? (
            <div className="empty">
              <span className="empty-icon"><UserPlus size={28} strokeWidth={1.4} aria-hidden="true" /></span>
              <p className="empty-text">{t('empty.firstClient')}</p>
              <button className="empty-action" type="button" onClick={() => setShowAdd(true)}>
                <UserPlus size={18} strokeWidth={1.6} aria-hidden="true" /> {t('empty.addClient')}
              </button>
            </div>
          ) : (
            <div className="empty"><p className="empty-text">{t('empty.noneInCategory')}</p></div>
          )
        ) : groupBy === 'project' ? (
          grouped.map(({ project, clients: pc }) => (
            <div key={project?.id || 'none'} className="c-proj-group">
              <p className="c-proj-head">
                <span
                  className="c-proj-dot"
                  style={{ background: project?.color || 'var(--stone)' }}
                  aria-hidden="true"
                />
                <span className="c-proj-name">{project?.name || t('project.none')}</span>
                <span className="c-proj-count mono">{pc.length}</span>
              </p>
              {pc.map((c, i) => (
                <ClientCard
                  key={c.id}
                  client={c}
                  index={i}
                  onOpen={setOpenId}
                  selectMode={selectMode}
                  selected={selectedIds.has(c.id)}
                  onToggleSelect={toggleSelect}
                  projects={projects}
                  txns={transactions}
                  sessions={sessions}
                  members={members}
                  groups={groups}
                  statuses={clientStatuses}
                  bal={balanceByClient.get(c.id)}
                />
              ))}
            </div>
          ))
        ) : (
          list.map((c, i) => (
            <ClientCard
              key={c.id}
              client={c}
              index={i}
              onOpen={setOpenId}
              selectMode={selectMode}
              selected={selectedIds.has(c.id)}
              onToggleSelect={toggleSelect}
              projects={projects}
              txns={transactions}
              sessions={sessions}
              members={members}
              groups={groups}
              statuses={clientStatuses}
              bal={balanceByClient.get(c.id)}
            />
          ))
        )}
      </section>

      {selectMode && (
        <div className="c-bulk-bar">
          <span className="c-bulk-count">{t('bulk.selected', { count: selectedIds.size })}</span>
          <div className="c-bulk-actions">
            <div className="c-bulk-meta-wrap" ref={bulkMetaAnchorRef}>
              <button
                type="button"
                className="c-bulk-btn"
                onClick={() => setBulkMetaOpen((v) => !v)}
                disabled={selectedIds.size === 0}
              >{t('bulk.changeStatus')} <ChevronLeft size={14} strokeWidth={1.5} aria-hidden="true" /></button>
              {bulkMetaOpen && (
                <div className="c-sort-pop c-bulk-pop" role="menu" style={{ [bulkMetaSide]: 0 }}>
                  <p className="c-sort-h">{t('bulk.moveTo')}</p>
                  {BULK_META_OPTIONS.map((o) => (
                    <button
                      key={o.k}
                      type="button"
                      className="c-sort-opt"
                      onClick={() => bulkChangeMeta(o.k)}
                    >{t(o.labelKey)}</button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="c-bulk-btn danger"
              onClick={() => setPendingDeleteBatch(selectedClients)}
              disabled={selectedIds.size === 0}
            >{t('bulk.delete')}</button>
            <button type="button" className="c-bulk-close" onClick={() => setSelectMode(false)} aria-label={t('bulk.closeAria')}>
              <X size={16} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <ClientDrawer
        client={openClient}
        onClose={() => setOpenId(null)}
        onDelete={() => setPendingDeleteClient(openClient)}
        projects={projects}
        txns={transactions}
        tasks={tasks}
        reminders={reminders}
        sessions={sessions}
        members={members}
        groups={groups}
        statuses={clientStatuses}
        categories={categories}
        clients={clientList}
        onLogSession={addSession}
        onScheduleMeeting={addMeeting}
        onAddPayment={addTransaction}
        onUpdateClient={handleUpdateClient}
        onUpdateMember={updateMember}
        onEditTransaction={editTransaction}
        onRemoveTransaction={removeTransaction}
        onIssued={refetch}
        onEditSession={updateSession}
        onEditTask={editTask}
        onEditReminder={editReminder}
      />

      <AddClientModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        projects={projects}
        statuses={clientStatuses}
        onSave={async (c) => { await addClient(c); setTab(c.status_meta || 'no_status') }}
      />

      <DeleteClientModal
        key={pendingDeleteClient?.id || (pendingDeleteBatch?.map((c) => c.id).join('|') || 'none')}
        open={!!pendingDeleteClient || !!pendingDeleteBatch}
        onClose={() => { setPendingDeleteClient(null); setPendingDeleteBatch(null) }}
        client={pendingDeleteClient}
        clients={pendingDeleteBatch}
        transactions={transactions}
        onRemoveClient={async (id) => {
          await removeClient(id)
          if (pendingDeleteClient?.id === id) setOpenId(null)
        }}
        onUpdateTransaction={editTransaction}
        onRemoveTransaction={removeTransaction}
      />
    </div>
  )
}
