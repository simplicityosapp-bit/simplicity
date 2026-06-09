import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Modal from './Modal'
import { ROUTES } from '../lib/routes'
import { isr } from '../lib/finance'
import { getTileFilters } from '../lib/homeData'
import { ClientsTrend, NetBars, TasksBars } from './TileDrillCharts'

const STATUS_OPTIONS = [
  { k: 'active',     l: 'פעיל׌' },
  { k: 'wandering',  l: 'ביניים' },
  { k: 'past',       l: 'לשעבר' },
  { k: 'no_status',  l: 'ללא' },
]
const NET_RANGES = [
  { k: 'thisWeek',    l: 'השבוע' },
  { k: 'thisMonth',   l: 'החודש' },
  { k: 'last30days',  l: '30 הימים האחרונים' },
]
const NET_TYPES = [
  { k: 'both',     l: 'נטו (הכנסות − הוצאות)' },
  { k: 'income',   l: 'הכנסות בלבד' },
  { k: 'expense',  l: 'הוצאות בלבד' },
]
const TASK_STATUS = [
  { k: 'open',  l: 'פתוחות' },
  { k: 'done',  l: 'בוצעו' },
  { k: 'both',  l: 'הכל' },
]
const TASK_PRIORITIES = [
  { k: 'high',   l: 'גבוהה' },
  { k: 'medium', l: 'בינונית' },
  { k: 'low',    l: 'נמוכה' },
]
/* One general client toggle instead of a pill-per-client list (beta
   07/06/2026): 'all' = no filter, 'linked' = only tasks tied to a client. */
const TASK_CLIENT_SCOPE = [
  { k: 'all',    l: 'הכל' },
  { k: 'linked', l: 'משויכות ללקוח' },
]

function toggleInList(list, value) {
  const arr = list || []
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value]
}

/* Pills group — single-select by default, multi via `multi` prop. Mobile-
   friendly: rows wrap, no horizontal overflow drama. */
function Pills({ options, value, onChange, multi = false }) {
  return (
    <div className="td-pills">
      {options.map((o) => {
        const active = multi ? (value || []).includes(o.k) : value === o.k
        return (
          <button
            key={o.k}
            type="button"
            className={`td-pill${active ? ' on' : ''}`}
            onClick={() => onChange(multi ? toggleInList(value, o.k) : o.k)}
          >
            {o.l}
          </button>
        )
      })}
    </div>
  )
}

/* Multi-select pill list with a leading "הכל" reset (active when nothing
   is selected). Replaces the old single-pick <select> for project/group/
   client/category filters — matches the prototype's multi-axis filter UX. */
function MultiPills({ items, selected, onChange, allLabel = 'הכל', emptyLabel = 'אין' }) {
  if (!items?.length) {
    return <p className="td-empty-inline">{emptyLabel}</p>
  }
  const list = selected || []
  return (
    <div className="td-pills td-pills-multi">
      <button
        type="button"
        className={`td-pill${list.length === 0 ? ' on' : ''}`}
        onClick={() => onChange([])}
      >
        {allLabel}
      </button>
      {items.map((it) => {
        const active = list.includes(it.id)
        return (
          <button
            key={it.id}
            type="button"
            className={`td-pill${active ? ' on' : ''}`}
            onClick={() => onChange(toggleInList(list, it.id))}
            title={it.name}
          >
            {it.color && <span className="td-pill-dot" style={{ background: it.color }} />}
            <span className="td-pill-name">{it.name}</span>
          </button>
        )
      })}
    </div>
  )
}

const DAY_MS = 86400000
/* Local calendar-day key "YYYY-MM-DD". A date-only string (e.g. a tx's
   `date` column) is already a calendar day — return it as-is. A full
   timestamp (e.g. a task's `updated_at`) is bucketed by LOCAL parts so
   the trend axis (also built from local Dates) and the data points agree;
   `toISOString()` would shift to UTC and mis-bucket rows near midnight. */
const pad2 = (n) => String(n).padStart(2, '0')
const dayKey = (d) => {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10)
  const dt = d instanceof Date ? d : new Date(d)
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
}

/* Approximation: for each day in the last N days, count clients
   created on/before that day and not yet deleted. Gives a meaningful
   30-day "client base" trend without needing status snapshots. */
function clientsTrendValues(clients, days = 30) {
  const out = new Array(days).fill(0)
  const liveClients = clients.filter((c) => !c.deleted_at)
  const today = new Date()
  for (let i = 0; i < days; i += 1) {
    const ts = today.getTime() - (days - 1 - i) * DAY_MS
    const cutoff = new Date(ts)
    cutoff.setHours(23, 59, 59, 999)
    out[i] = liveClients.filter((c) => {
      const created = c.created_at ? new Date(c.created_at).getTime() : 0
      return created <= cutoff.getTime()
    }).length
  }
  return out
}

function netTrendValues(transactions, days = 30) {
  const incomes = new Array(days).fill(0)
  const expenses = new Array(days).fill(0)
  const today = new Date()
  const startKey = dayKey(new Date(today.getTime() - (days - 1) * DAY_MS))
  const idxMap = new Map()
  for (let i = 0; i < days; i += 1) {
    const k = dayKey(new Date(today.getTime() - (days - 1 - i) * DAY_MS))
    idxMap.set(k, i)
  }
  transactions.forEach((t) => {
    if (t.deleted_at) return
    if (t.status !== 'confirmed') return
    const k = dayKey(t.date)
    if (k < startKey) return
    const idx = idxMap.get(k)
    if (idx == null) return
    if (t.type === 'income') incomes[idx] += t.amount
    else if (t.type === 'expense') expenses[idx] += t.amount
  })
  return { incomes, expenses }
}

function tasksDoneTrend(tasks, days = 7) {
  const values = new Array(days).fill(0)
  const dows = new Array(days).fill(0)
  const today = new Date()
  for (let i = 0; i < days; i += 1) {
    const d = new Date(today.getTime() - (days - 1 - i) * DAY_MS)
    dows[i] = d.getDay()
    const k = dayKey(d)
    values[i] = tasks.filter((t) => {
      if (t.deleted_at) return false
      if (t.status !== 'done') return false
      const completedAt = t.updated_at || t.completed_at
      if (!completedAt) return false
      return dayKey(completedAt) === k
    }).length
  }
  return { values, dows }
}

function ClientsPanel({ filters, setFilter, clients, projects, groups }) {
  const liveClients = clients.filter((c) => !c.deleted_at)
  const filtered = useMemo(() => {
    return liveClients.filter((c) => {
      const meta = c.status_meta || c.status
      if (filters.statuses?.length && !filters.statuses.includes(meta)) return false
      if (filters.projectIds?.length && !filters.projectIds.includes(c.project_id)) return false
      if (filters.groupIds?.length && !filters.groupIds.includes(c.group_id)) return false
      return true
    })
  }, [liveClients, filters])
  const trend = useMemo(() => clientsTrendValues(liveClients, 30), [liveClients])

  return (
    <>
      <p className="td-num mono">{filtered.length}</p>
      <p className="td-num-lbl">לקוחות תואמים</p>

      <div className="td-chart-block">
        <p className="td-chart-lbl">בסיס הלקוחות · 30 ימים</p>
        <ClientsTrend values={trend} />
      </div>

      <p className="td-field-lbl">סטטוס</p>
      <Pills options={STATUS_OPTIONS} value={filters.statuses} multi
             onChange={(v) => setFilter('statuses', v)} />

      <p className="td-field-lbl">פרויקט</p>
      <MultiPills items={projects} selected={filters.projectIds} onChange={(v) => setFilter('projectIds', v)} emptyLabel="אין פרויקטים עדיין" />

      <p className="td-field-lbl">קבוצה</p>
      <MultiPills items={groups} selected={filters.groupIds} onChange={(v) => setFilter('groupIds', v)} emptyLabel="אין קבוצות עדיין" />

      <p className="td-section-lbl">תואמים ({filtered.length})</p>
      <div className="td-list">
        {filtered.length === 0 ? (
          <p className="td-empty">אין לקוחות שתואמים לפילטר.</p>
        ) : (
          filtered.slice(0, 8).map((c) => (
            <div key={c.id} className="td-list-row">
              <span className="td-list-name">{c.name}</span>
              <span className="td-list-meta">{statusLabel(c.status_meta || c.status)}</span>
            </div>
          ))
        )}
        {filtered.length > 8 && (
          <p className="td-list-more">+{filtered.length - 8} נוספים</p>
        )}
      </div>
    </>
  )
}

function statusLabel(meta) {
  return ({
    active: 'פעיל׌',
    wandering: 'ביניים',
    past: 'לשעבר',
    no_status: 'ללא',
  })[meta] || meta || '—'
}

function NetPanel({ filters, setFilter, transactions, projects, categories, summary }) {
  const trend = useMemo(() => netTrendValues(transactions || [], 30), [transactions])
  return (
    <>
      <p className={`td-num mono${summary.net < 0 ? ' neg' : ''}`}>
        {summary.net < 0 ? '−' : ''}{isr(Math.abs(summary.net))}
      </p>
      <p className="td-num-lbl">{filters.type === 'income' ? 'הכנסות' : filters.type === 'expense' ? 'הוצאות' : 'נטו'}</p>

      <div className="td-chart-block">
        <p className="td-chart-lbl">הכנסות מול הוצאות · 30 ימים</p>
        <NetBars incomes={trend.incomes} expenses={trend.expenses} />
        <div className="td-chart-legend">
          <span className="td-chart-key"><span className="td-chart-swatch sage" />הכנסות</span>
          <span className="td-chart-key"><span className="td-chart-swatch clay" />הוצאות</span>
        </div>
      </div>

      <p className="td-field-lbl">טווח זמן</p>
      <Pills options={NET_RANGES} value={filters.timeRange}
             onChange={(v) => setFilter('timeRange', v)} />

      <p className="td-field-lbl">סוג</p>
      <Pills options={NET_TYPES} value={filters.type}
             onChange={(v) => setFilter('type', v)} />

      <p className="td-field-lbl">פרויקט</p>
      <MultiPills items={projects} selected={filters.projectIds} onChange={(v) => setFilter('projectIds', v)} emptyLabel="אין פרויקטים עדיין" />

      <p className="td-field-lbl">קטגוריה</p>
      <MultiPills items={categories} selected={filters.categoryIds} onChange={(v) => setFilter('categoryIds', v)} emptyLabel="אין קטגוריות עדיין" />

      <div className="td-mini-stats">
        <div className="td-mini">
          <p className="td-mini-l">הכנסות</p>
          <p className="td-mini-v mono">{isr(summary._income || 0)}</p>
        </div>
        <div className="td-mini">
          <p className="td-mini-l">הוצאות</p>
          <p className="td-mini-v mono">{isr(summary._expense || 0)}</p>
        </div>
        <div className="td-mini">
          <p className="td-mini-l">תנועות</p>
          <p className="td-mini-v mono">{summary._txCount || 0}</p>
        </div>
      </div>
    </>
  )
}

function TasksPanel({ filters, setFilter, tasks, projects }) {
  const liveTasks = (tasks || []).filter((t) => !t.deleted_at)
  const filtered = useMemo(() => {
    return liveTasks.filter((t) => {
      if (filters.status === 'open' && t.status === 'done') return false
      if (filters.status === 'done' && t.status !== 'done') return false
      if (filters.priorities?.length && !filters.priorities.includes(t.priority)) return false
      if (filters.projectIds?.length && !filters.projectIds.includes(t.project_id)) return false
      if (filters.clientScope === 'linked' && !t.client_id) return false
      return true
    }).sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 }
      return (order[a.priority] ?? 9) - (order[b.priority] ?? 9)
    })
  }, [liveTasks, filters])
  const trend = useMemo(() => tasksDoneTrend(liveTasks, 7), [liveTasks])

  return (
    <>
      <p className="td-num mono">{filtered.length}</p>
      <p className="td-num-lbl">משימות תואמות</p>

      <div className="td-chart-block">
        <p className="td-chart-lbl">משימות שהושלמו · 7 ימים</p>
        <TasksBars values={trend.values} daysOfWeek={trend.dows} />
      </div>

      <p className="td-field-lbl">סטטוס</p>
      <Pills options={TASK_STATUS} value={filters.status}
             onChange={(v) => setFilter('status', v)} />

      <p className="td-field-lbl">דחיפות</p>
      <Pills options={TASK_PRIORITIES} value={filters.priorities} multi
             onChange={(v) => setFilter('priorities', v)} />

      <p className="td-field-lbl">פרויקט</p>
      <MultiPills items={projects} selected={filters.projectIds} onChange={(v) => setFilter('projectIds', v)} emptyLabel="אין פרויקטים עדיין" />

      <p className="td-field-lbl">שיוך ללקוח</p>
      <Pills options={TASK_CLIENT_SCOPE} value={filters.clientScope || 'all'}
             onChange={(v) => setFilter('clientScope', v)} />

      <p className="td-section-lbl">המשימות הקרובות</p>
      <div className="td-list">
        {filtered.length === 0 ? (
          <p className="td-empty">אין משימות שתואמות לפילטר.</p>
        ) : (
          filtered.slice(0, 8).map((t) => (
            <div key={t.id} className="td-list-row">
              <span className="td-list-name">{t.title}</span>
              <span className={`td-list-meta priority-${t.priority || 'low'}`}>
                {({ high: 'גבוהה', medium: 'בינונית', low: 'נמוכה' })[t.priority] || ''}
              </span>
            </div>
          ))
        )}
        {filtered.length > 8 && (
          <p className="td-list-more">+{filtered.length - 8} נוספות</p>
        )}
      </div>
    </>
  )
}

/* Drill-down modal opened by tapping a tile in ChipsWidget. Holds
   the per-tile filter state in userPreferences.tileFilters and
   dispatches to the right panel. The "פתיחה במלא ←" link routes
   to the corresponding screen for full management. */
export default function TileDrillModal({
  open, onClose, tile,
  prefs, updatePrefs,
  clients = [], groups = [], projects = [], categories = [],
  tasks = [], transactions = [],
  netSummary = {},
}) {
  const navigate = useNavigate()
  const allFilters = getTileFilters(prefs)
  const filters = allFilters[tile] || {}

  const setFilter = (key, value) => {
    const nextTile = { ...filters, [key]: value }
    updatePrefs?.({ tileFilters: { ...(prefs?.tileFilters || {}), [tile]: nextTile } })
  }

  const titles = {
    clients: 'לקוחות',
    net: 'נטו',
    tasks: 'משימות',
  }
  const routes = {
    clients: ROUTES.CLIENTS,
    net: ROUTES.FINANCE,
    tasks: ROUTES.TASKS,
  }

  return (
    <Modal open={open} onClose={onClose} title={titles[tile] || ''}>
      <div className="td-body">
        {tile === 'clients' && (
          <ClientsPanel
            filters={filters}
            setFilter={setFilter}
            clients={clients}
            projects={projects}
            groups={groups}
          />
        )}
        {tile === 'net' && (
          <NetPanel
            filters={filters}
            setFilter={setFilter}
            transactions={transactions}
            projects={projects}
            categories={categories}
            summary={netSummary}
          />
        )}
        {tile === 'tasks' && (
          <TasksPanel
            filters={filters}
            setFilter={setFilter}
            tasks={tasks}
            projects={projects}
          />
        )}
      </div>

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose}>סגירה</button>
        <button
          type="button"
          className="m-btn-save"
          onClick={() => { navigate(routes[tile]); onClose() }}
        >
          <ArrowLeft size={14} strokeWidth={1.8} aria-hidden="true" /> פתיחה במלא
        </button>
      </div>
    </Modal>
  )
}
