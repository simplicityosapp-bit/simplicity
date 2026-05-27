import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Modal from './Modal'
import { ROUTES } from '../lib/routes'
import { isr } from '../lib/finance'
import { getTileFilters } from '../lib/homeData'

const STATUS_OPTIONS = [
  { k: 'active',     l: 'פעיל' },
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

function toggleInList(list, value) {
  const arr = list || []
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value]
}

function Pills({ options, value, onChange, multi = false }) {
  return (
    <div className="td-pills">
      {options.map((o) => {
        const active = multi
          ? (value || []).includes(o.k)
          : value === o.k
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

  return (
    <>
      <p className="td-num mono">{filtered.length}</p>
      <p className="td-num-lbl">לקוחות תואמים</p>

      <p className="td-field-lbl">סטטוס</p>
      <Pills options={STATUS_OPTIONS} value={filters.statuses} multi
             onChange={(v) => setFilter('statuses', v)} />

      <div className="td-row2">
        <div className="td-field">
          <p className="td-field-lbl">פרויקט</p>
          <select className="m-select" value={filters.projectIds?.[0] || ''} onChange={(e) => setFilter('projectIds', e.target.value ? [e.target.value] : [])}>
            <option value="">הכל</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="td-field">
          <p className="td-field-lbl">קבוצה</p>
          <select className="m-select" value={filters.groupIds?.[0] || ''} onChange={(e) => setFilter('groupIds', e.target.value ? [e.target.value] : [])}>
            <option value="">הכל</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      </div>

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
    active: 'פעיל',
    wandering: 'ביניים',
    past: 'לשעבר',
    no_status: 'ללא',
  })[meta] || meta || '—'
}

function NetPanel({ filters, setFilter, transactions, projects, categories, summary }) {
  return (
    <>
      <p className={`td-num mono${summary.net < 0 ? ' neg' : ''}`}>
        {summary.net < 0 ? '−' : ''}{isr(Math.abs(summary.net))}
      </p>
      <p className="td-num-lbl">{filters.type === 'income' ? 'הכנסות' : filters.type === 'expense' ? 'הוצאות' : 'נטו'}</p>

      <p className="td-field-lbl">טווח זמן</p>
      <Pills options={NET_RANGES} value={filters.timeRange}
             onChange={(v) => setFilter('timeRange', v)} />

      <p className="td-field-lbl">סוג</p>
      <Pills options={NET_TYPES} value={filters.type}
             onChange={(v) => setFilter('type', v)} />

      <div className="td-row2">
        <div className="td-field">
          <p className="td-field-lbl">פרויקט</p>
          <select className="m-select" value={filters.projectIds?.[0] || ''} onChange={(e) => setFilter('projectIds', e.target.value ? [e.target.value] : [])}>
            <option value="">הכל</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="td-field">
          <p className="td-field-lbl">קטגוריה</p>
          <select className="m-select" value={filters.categoryIds?.[0] || ''} onChange={(e) => setFilter('categoryIds', e.target.value ? [e.target.value] : [])}>
            <option value="">הכל</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

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

function TasksPanel({ filters, setFilter, tasks, projects, clients }) {
  const liveTasks = (tasks || []).filter((t) => !t.deleted_at)
  const filtered = useMemo(() => {
    return liveTasks.filter((t) => {
      if (filters.status === 'open' && t.status === 'done') return false
      if (filters.status === 'done' && t.status !== 'done') return false
      if (filters.priorities?.length && !filters.priorities.includes(t.priority)) return false
      if (filters.projectIds?.length && !filters.projectIds.includes(t.project_id)) return false
      if (filters.clientIds?.length && !filters.clientIds.includes(t.client_id)) return false
      return true
    }).sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 }
      return (order[a.priority] ?? 9) - (order[b.priority] ?? 9)
    })
  }, [liveTasks, filters])

  return (
    <>
      <p className="td-num mono">{filtered.length}</p>
      <p className="td-num-lbl">משימות תואמות</p>

      <p className="td-field-lbl">סטטוס</p>
      <Pills options={TASK_STATUS} value={filters.status}
             onChange={(v) => setFilter('status', v)} />

      <p className="td-field-lbl">דחיפות</p>
      <Pills options={TASK_PRIORITIES} value={filters.priorities} multi
             onChange={(v) => setFilter('priorities', v)} />

      <div className="td-row2">
        <div className="td-field">
          <p className="td-field-lbl">פרויקט</p>
          <select className="m-select" value={filters.projectIds?.[0] || ''} onChange={(e) => setFilter('projectIds', e.target.value ? [e.target.value] : [])}>
            <option value="">הכל</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="td-field">
          <p className="td-field-lbl">לקוח</p>
          <select className="m-select" value={filters.clientIds?.[0] || ''} onChange={(e) => setFilter('clientIds', e.target.value ? [e.target.value] : [])}>
            <option value="">הכל</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

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
    net: 'מאזן',
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
            clients={clients}
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
