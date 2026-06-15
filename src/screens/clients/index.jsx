import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Search, ArrowUpDown, X, UserPlus, Wallet } from 'lucide-react'
import { effectiveClientMeta, paidForClients, sessionsCountForClients, clientBalance } from '../../lib/clients'
import { currentMonthRange, isr, financeQuery } from '../../lib/finance'
import { useClients } from '../../hooks/useClients'
import { useProjects } from '../../hooks/useProjects'
import { useTransactions } from '../../hooks/useTransactions'
import { useTasks } from '../../hooks/useTasks'
import { useReminders } from '../../hooks/useReminders'
import { useSessions } from '../../hooks/useSessions'
import { useScheduledMeetings } from '../../hooks/useScheduledMeetings'
import { usePopoverSide } from '../../hooks/usePopoverSide'
import { useGroups } from '../../hooks/useGroups'
import { useGroupMembers } from '../../hooks/useGroupMembers'
import { useClientStatuses } from '../../hooks/useClientStatuses'
import { useCategories } from '../../hooks/useCategories'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useAddress } from '../../hooks/useAddress'
import ClientTabs from './ClientTabs'
import ClientCard from './ClientCard'
import ClientDrawer from '../../drawers/client/ClientDrawer'
import AddClientModal from '../../modals/AddClientModal'
import DeleteClientModal from '../../modals/DeleteClientModal'
import MG from '../../components/MG'
import { pushUndo } from '../../lib/undo'
import './ClientsScreen.css'

const HERO_LABEL = {
  active: 'סיכום לקוחות פעיל׊׉',
  wandering: 'סיכום לקוחות ביניים',
  past: 'סיכום לקוחות לשעבר',
  no_status: 'סיכום ללא סטטוס',
}

const SORT_OPTIONS = [
  { k: 'name',     l: 'שם' },
  { k: 'balance',  l: 'יתרה' },
  { k: 'paid',     l: 'שולם' },
  { k: 'sessions', l: 'פגישות' },
  { k: 'created',  l: 'תאריך הוספה' },
  { k: 'oldest',   l: 'ותק (הכי ישן)' },
]
const BULK_META_OPTIONS = [
  { k: 'active',    l: 'פעיל׌' },
  { k: 'wandering', l: 'ביניים' },
  { k: 'past',      l: 'לשעבר' },
  { k: 'no_status', l: 'ללא סטטוס' },
]
const DEFAULT_SORT = { field: 'name', dir: 'asc' }

function sortClients(arr, sort, ctx) {
  const dir = sort.dir === 'desc' ? -1 : 1
  const { transactions, sessions, members, groups } = ctx
  return [...arr].sort((a, b) => {
    let av, bv
    switch (sort.field) {
      case 'balance':
        av = clientBalance(a, transactions, sessions, members, groups).balance
        bv = clientBalance(b, transactions, sessions, members, groups).balance
        return (av - bv) * dir
      case 'sessions':
        av = clientBalance(a, transactions, sessions, members, groups).sessionsPaid
        bv = clientBalance(b, transactions, sessions, members, groups).sessionsPaid
        return (av - bv) * dir
      case 'paid':
        av = financeQuery({ type: 'income', clientId: a.id, source: transactions }).reduce((s, f) => s + f.amount, 0)
        bv = financeQuery({ type: 'income', clientId: b.id, source: transactions }).reduce((s, f) => s + f.amount, 0)
        return (av - bv) * dir
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
  const { addr } = useAddress()
  const { clients: clientList, loading, error, addClient, updateClient, removeClient } = useClients()
  const { projects } = useProjects()
  const { transactions, addTransaction, editTransaction, removeTransaction, refetch } = useTransactions()
  const { tasks, editTask } = useTasks()
  const { reminders, editReminder } = useReminders()
  const { sessions, addSession, updateSession } = useSessions()
  const { addMeeting } = useScheduledMeetings()
  const { groups } = useGroups()
  const { members, updateMember } = useGroupMembers()
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
  /* Allow deep-link to a specific client (e.g. from project drawer). */
  useEffect(() => { if (routeClientId) setOpenId(routeClientId) }, [routeClientId])
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
    if (balanceOnly) filtered = filtered.filter((c) => clientBalance(c, transactions, sessions, members, groups).balance > 0)
    return sortClients(filtered, sort, { transactions, sessions, members, groups })
  }, [sourceClients, query, sort, balanceOnly, transactions, sessions, members, groups])

  /* How many clients in the current view still owe — shown on the filter pill. */
  const openBalanceCount = useMemo(
    () => sourceClients.filter((c) => clientBalance(c, transactions, sessions, members, groups).balance > 0).length,
    [sourceClients, transactions, sessions, members, groups],
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

  /* Clear selection when switching tabs or leaving select mode. */
  useEffect(() => { setSelectedIds(new Set()) }, [tab, selectMode])

  const setSort = (patch) => updatePrefs?.({ clientsSort: { ...sort, ...patch } })

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

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
        label: snapshots.length === 1 ? 'הסטטוס שונה' : `סטטוס שונה ל-${snapshots.length} לקוחות`,
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
    const balance = tabClients.reduce((s, c) => s + clientBalance(c, transactions, sessions, members, groups).balance, 0)
    if (tab === 'past' || tab === 'no_status') {
      return [
        { l: 'לקוחות', v: tabClients.length },
        { l: 'פגישות', v: sessionsCountForClients(tabClients, range, sessions, members, groups) },
        { l: 'שולם', v: isr(paid) },
      ]
    }
    let sessionsLabel
    if (effScope === 'monthly') {
      sessionsLabel = String(sessionsCountForClients(tabClients, range, sessions, members, groups))
    } else {
      const done = tabClients.reduce((s, c) => s + clientBalance(c, transactions, sessions, members, groups).sessionsPaid, 0)
      const allot = tabClients.reduce((s, c) => s + (c.sessions || 0), 0)
      sessionsLabel = `${done}/${allot}`
    }
    return [
      { l: 'פגישות', v: sessionsLabel },
      { l: 'שולם', v: isr(paid) },
      { l: 'יתרה פתוחה', v: isr(balance) },
    ]
  }, [tab, effScope, tabClients, transactions, sessions, members, groups])

  return (
    <div className={`screen${selectMode ? ' has-bulk-bar' : ''}`}>
      <div className="screen-top">
        <header className="screen-head">
          <div>
            <div className="screen-head-meta">
              <p className="lbl">{total} לקוחות</p>
              <span className="lbl dot">·</span>
              <p className="lbl">סיכום</p>
            </div>
            <p className="lbl-sm">בניית קשרים יוצרת תוצאות.</p>
          </div>
          <p className="t-screen">לקוחות</p>
        </header>
        <button className="cta-add" type="button" aria-label="הוספת לקוח" onClick={() => setShowAdd(true)}>+ <MG word="client_new" /></button>
      </div>
      <div className="c-top-actions">
          <div className="c-sort-wrap" ref={sortAnchorRef}>
            <button
              type="button"
              className="c-sort-btn"
              onClick={() => setSortOpen((v) => !v)}
              aria-expanded={sortOpen}
              aria-label="מיון"
            >
              <ArrowUpDown size={14} strokeWidth={1.7} aria-hidden="true" /> מיון
            </button>
            {sortOpen && (
              <div className="c-sort-pop" role="menu" style={{ [sortSide]: 0 }}>
                <p className="c-sort-h">{addr({male:'מיין לפי',female:'מייני לפי',neutral:'מיין/י לפי'})}</p>
                {SORT_OPTIONS.map((o) => (
                  <button
                    key={o.k}
                    type="button"
                    className={`c-sort-opt${sort.field === o.k ? ' on' : ''}`}
                    onClick={() => setSort({ field: o.k })}
                  >
                    {o.l}
                  </button>
                ))}
                <div className="c-sort-divider" />
                <div className="c-sort-dir">
                  <button
                    type="button"
                    className={`c-sort-opt${sort.dir === 'asc' ? ' on' : ''}`}
                    onClick={() => setSort({ dir: 'asc' })}
                  >עולה</button>
                  <button
                    type="button"
                    className={`c-sort-opt${sort.dir === 'desc' ? ' on' : ''}`}
                    onClick={() => setSort({ dir: 'desc' })}
                  >יורד</button>
                </div>
              </div>
            )}
          </div>
          <div className="mg-toggle c-groupby" role="tablist" aria-label="קיבוץ לקוחות">
            <button
              type="button"
              className={`mg-toggle-btn${groupBy === 'status' ? ' on' : ''}`}
              onClick={() => setGroupBy('status')}
            >סטטוס</button>
            <button
              type="button"
              className={`mg-toggle-btn${groupBy === 'project' ? ' on' : ''}`}
              onClick={() => setGroupBy('project')}
            >פרויקט</button>
          </div>
          <button
            type="button"
            className={`c-select-btn${selectMode ? ' on' : ''}`}
            onClick={() => setSelectMode((v) => !v)}
          >
            {selectMode ? 'בטל בחירה' : addr({male:'בחר',female:'בחרי',neutral:'בחר/י'})}
          </button>
        </div>

      {groupBy === 'status' && (
        <ClientTabs active={tab} counts={counts} showNoStatus={counts.no_status > 0} onChange={setTab} />
      )}

      <div className="c-search">
        <Search size={16} strokeWidth={1.6} aria-hidden="true" />
        <input
          type="search"
          placeholder="חיפוש לקוח…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="c-filter-row">
        <button
          type="button"
          className={`c-bal-filter${balanceOnly ? ' on' : ''}`}
          onClick={() => setBalanceOnly(!balanceOnly)}
          aria-pressed={balanceOnly}
        >
          <Wallet size={13} strokeWidth={1.8} aria-hidden="true" />
          יתרה פתוחה{openBalanceCount > 0 ? ` · ${openBalanceCount}` : ''}
        </button>
      </div>

      {groupBy === 'status' && (
        <section className="c-hero">
          <div className="s-hero">
            <div className="mg-toggle" role="tablist" aria-label="טווח סכומים">
              <button type="button" className={`mg-toggle-btn${effScope === 'monthly' ? ' on' : ''}`} onClick={() => setScope('monthly')} disabled={scopeLocked}>חודשי</button>
              <button type="button" className={`mg-toggle-btn${effScope === 'cumulative' ? ' on' : ''}`} onClick={() => setScope('cumulative')} disabled={scopeLocked}>מצטבר</button>
            </div>
            <p className="c-hero-scope-note">
              {scopeLocked ? 'מצטבר · לקוחות לשעבר' : (scope === 'monthly' ? 'טווח הסכומים: החודש' : 'טווח הסכומים: מההתחלה')}
            </p>
            <p className="c-hero-title"><MG text={HERO_LABEL[tab]} /></p>
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
          <div className="empty"><p className="empty-text">טוען לקוחות…</p></div>
        ) : error ? (
          <div className="empty"><p className="empty-text">שגיאה בטעינת הלקוחות: {error}</p></div>
        ) : list.length === 0 ? (
          query ? (
            <div className="empty"><p className="empty-text">לא נמצאו לקוחות בחיפוש.</p></div>
          ) : total === 0 ? (
            <div className="empty">
              <span className="empty-icon"><UserPlus size={28} strokeWidth={1.4} aria-hidden="true" /></span>
              <p className="empty-text">עדיין אין לקוחות. הלקוח הראשון שלך מתחיל כאן.</p>
              <button className="empty-action" type="button" onClick={() => setShowAdd(true)}>
                <UserPlus size={18} strokeWidth={1.6} aria-hidden="true" /> {addr({ male: 'הוסף לקוח', female: 'הוסיפי לקוח', neutral: 'הוסף/י לקוח' })}
              </button>
            </div>
          ) : (
            <div className="empty"><p className="empty-text">אין לקוחות בקטגוריה זו.</p></div>
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
                <span className="c-proj-name">{project?.name || 'ללא פרויקט'}</span>
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
            />
          ))
        )}
      </section>

      {selectMode && (
        <div className="c-bulk-bar">
          <span className="c-bulk-count">{selectedIds.size} נבחרו</span>
          <div className="c-bulk-actions">
            <div className="c-bulk-meta-wrap" ref={bulkMetaAnchorRef}>
              <button
                type="button"
                className="c-bulk-btn"
                onClick={() => setBulkMetaOpen((v) => !v)}
                disabled={selectedIds.size === 0}
              >שינוי סטטוס ←</button>
              {bulkMetaOpen && (
                <div className="c-sort-pop c-bulk-pop" role="menu" style={{ [bulkMetaSide]: 0 }}>
                  <p className="c-sort-h">העברה ל-</p>
                  {BULK_META_OPTIONS.map((o) => (
                    <button
                      key={o.k}
                      type="button"
                      className="c-sort-opt"
                      onClick={() => bulkChangeMeta(o.k)}
                    >{o.l}</button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="c-bulk-btn danger"
              onClick={() => setPendingDeleteBatch(selectedClients)}
              disabled={selectedIds.size === 0}
            >מחיקה</button>
            <button type="button" className="c-bulk-close" onClick={() => setSelectMode(false)} aria-label="סגירת מצב בחירה">
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
        onUpdateClient={updateClient}
        onUpdateMember={updateMember}
        onEditTransaction={editTransaction}
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
        onSave={async (c) => { await addClient(c); setTab(c.status_meta) }}
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
