import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import Modal from './Modal'
import { ROUTES } from '../lib/routes'
import { isr } from '../lib/finance'
import { fmtTime } from '../lib/dates'
import { getTileFilters, todayItems } from '../lib/homeData'
import { confirmScheduledMeeting } from '../lib/scheduledMeetings'
import WhatsAppButton from '../components/WhatsAppButton'
import { useT } from '../i18n/useT'
import { ClientsTrend, NetBars, TasksBars } from './TileDrillCharts'

/* Option keys only — labels are resolved via t() at render so the pills
   localize. The `tk` is the sub-key under the given group in the json. */
const STATUS_OPTIONS = ['active', 'wandering', 'past', 'no_status']
const NET_RANGES = ['thisWeek', 'thisMonth', 'last30days']
const NET_TYPES = ['both', 'income', 'expense']
const TASK_STATUS = ['open', 'done', 'both']
const TASK_PRIORITIES = ['high', 'medium', 'low']
/* One general client toggle instead of a pill-per-client list (beta
   07/06/2026): 'all' = no filter, 'linked' = only tasks tied to a client. */
const TASK_CLIENT_SCOPE = ['all', 'linked']
const TODAY_KINDS = ['meeting', 'calendar', 'followup']

function toggleInList(list, value) {
  const arr = list || []
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value]
}

/* Pills group — single-select by default, multi via `multi` prop. Mobile-
   friendly: rows wrap, no horizontal overflow drama. `options` is a list of
   keys; `label(key)` resolves each to localized text. */
function Pills({ options, value, onChange, multi = false, label }) {
  return (
    <div className="td-pills">
      {options.map((k) => {
        const active = multi ? (value || []).includes(k) : value === k
        return (
          <button
            key={k}
            type="button"
            className={`td-pill${active ? ' on' : ''}`}
            onClick={() => onChange(multi ? toggleInList(value, k) : k)}
          >
            {label(k)}
          </button>
        )
      })}
    </div>
  )
}

/* Multi-select pill list with a leading "all" reset (active when nothing
   is selected). Replaces the old single-pick <select> for project/group/
   client/category filters — matches the prototype's multi-axis filter UX. */
function MultiPills({ items, selected, onChange, allLabel, emptyLabel }) {
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

function ClientsPanel({ filters, setFilter, clients, projects, groups, t }) {
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
      <p className="td-num-lbl">{t('tileDrill.clients.matchingNum')}</p>

      <div className="td-chart-block">
        <p className="td-chart-lbl">{t('tileDrill.clients.trendLbl')}</p>
        <ClientsTrend values={trend} />
      </div>

      <p className="td-field-lbl">{t('tileDrill.clients.statusLbl')}</p>
      <Pills options={STATUS_OPTIONS} value={filters.statuses} multi
             label={(k) => t(`tileDrill.status.${k}`)}
             onChange={(v) => setFilter('statuses', v)} />

      <p className="td-field-lbl">{t('tileDrill.clients.projectLbl')}</p>
      <MultiPills items={projects} selected={filters.projectIds} onChange={(v) => setFilter('projectIds', v)} allLabel={t('tileDrill.all')} emptyLabel={t('tileDrill.clients.noProjects')} />

      <p className="td-field-lbl">{t('tileDrill.clients.groupLbl')}</p>
      <MultiPills items={groups} selected={filters.groupIds} onChange={(v) => setFilter('groupIds', v)} allLabel={t('tileDrill.all')} emptyLabel={t('tileDrill.clients.noGroups')} />

      <p className="td-section-lbl">{t('tileDrill.clients.matchingSection', { count: filtered.length })}</p>
      <div className="td-list">
        {filtered.length === 0 ? (
          <p className="td-empty">{t('tileDrill.clients.emptyFilter')}</p>
        ) : (
          filtered.slice(0, 8).map((c) => (
            <div key={c.id} className="td-list-row">
              <span className="td-list-name">{c.name}</span>
              <span className="td-list-meta">{statusLabel(c.status_meta || c.status, t)}</span>
            </div>
          ))
        )}
        {filtered.length > 8 && (
          <p className="td-list-more">{t('tileDrill.clients.moreCount', { count: filtered.length - 8 })}</p>
        )}
      </div>
    </>
  )
}

function statusLabel(meta, t) {
  const known = ['active', 'wandering', 'past', 'no_status']
  return known.includes(meta) ? t(`tileDrill.status.${meta}`) : (meta || '—')
}

function NetPanel({ filters, setFilter, transactions, projects, categories, summary, t }) {
  const trend = useMemo(() => netTrendValues(transactions || [], 30), [transactions])
  return (
    <>
      <p className={`td-num mono${summary.net < 0 ? ' neg' : ''}`}>
        {summary.net < 0 ? '−' : ''}{isr(Math.abs(summary.net))}
      </p>
      <p className="td-num-lbl">{filters.type === 'income' ? t('tileDrill.net.income') : filters.type === 'expense' ? t('tileDrill.net.expense') : t('tileDrill.net.net')}</p>

      <div className="td-chart-block">
        <p className="td-chart-lbl">{t('tileDrill.net.trendLbl')}</p>
        <NetBars incomes={trend.incomes} expenses={trend.expenses} />
        <div className="td-chart-legend">
          <span className="td-chart-key"><span className="td-chart-swatch sage" />{t('tileDrill.net.legendIncome')}</span>
          <span className="td-chart-key"><span className="td-chart-swatch clay" />{t('tileDrill.net.legendExpense')}</span>
        </div>
      </div>

      <p className="td-field-lbl">{t('tileDrill.net.timeRangeLbl')}</p>
      <Pills options={NET_RANGES} value={filters.timeRange}
             label={(k) => t(`tileDrill.netRanges.${k}`)}
             onChange={(v) => setFilter('timeRange', v)} />

      <p className="td-field-lbl">{t('tileDrill.net.typeLbl')}</p>
      <Pills options={NET_TYPES} value={filters.type}
             label={(k) => t(`tileDrill.netTypes.${k}`)}
             onChange={(v) => setFilter('type', v)} />

      <p className="td-field-lbl">{t('tileDrill.net.projectLbl')}</p>
      <MultiPills items={projects} selected={filters.projectIds} onChange={(v) => setFilter('projectIds', v)} allLabel={t('tileDrill.all')} emptyLabel={t('tileDrill.net.noProjects')} />

      <p className="td-field-lbl">{t('tileDrill.net.categoryLbl')}</p>
      <MultiPills items={categories} selected={filters.categoryIds} onChange={(v) => setFilter('categoryIds', v)} allLabel={t('tileDrill.all')} emptyLabel={t('tileDrill.net.noCategories')} />

      <div className="td-mini-stats">
        <div className="td-mini">
          <p className="td-mini-l">{t('tileDrill.net.miniIncome')}</p>
          <p className="td-mini-v mono">{isr(summary._income || 0)}</p>
        </div>
        <div className="td-mini">
          <p className="td-mini-l">{t('tileDrill.net.miniExpense')}</p>
          <p className="td-mini-v mono">{isr(summary._expense || 0)}</p>
        </div>
        <div className="td-mini">
          <p className="td-mini-l">{t('tileDrill.net.miniTx')}</p>
          <p className="td-mini-v mono">{summary._txCount || 0}</p>
        </div>
      </div>
    </>
  )
}

function TasksPanel({ filters, setFilter, tasks, projects, t }) {
  const liveTasks = (tasks || []).filter((tk) => !tk.deleted_at)
  const filtered = useMemo(() => {
    return liveTasks.filter((tk) => {
      if (filters.status === 'open' && tk.status === 'done') return false
      if (filters.status === 'done' && tk.status !== 'done') return false
      if (filters.priorities?.length && !filters.priorities.includes(tk.priority)) return false
      if (filters.projectIds?.length && !filters.projectIds.includes(tk.project_id)) return false
      if (filters.clientScope === 'linked' && !tk.client_id) return false
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
      <p className="td-num-lbl">{t('tileDrill.tasks.matchingNum')}</p>

      <div className="td-chart-block">
        <p className="td-chart-lbl">{t('tileDrill.tasks.trendLbl')}</p>
        <TasksBars values={trend.values} daysOfWeek={trend.dows} />
      </div>

      <p className="td-field-lbl">{t('tileDrill.tasks.statusLbl')}</p>
      <Pills options={TASK_STATUS} value={filters.status}
             label={(k) => t(`tileDrill.taskStatus.${k}`)}
             onChange={(v) => setFilter('status', v)} />

      <p className="td-field-lbl">{t('tileDrill.tasks.priorityLbl')}</p>
      <Pills options={TASK_PRIORITIES} value={filters.priorities} multi
             label={(k) => t(`tileDrill.priorities.${k}`)}
             onChange={(v) => setFilter('priorities', v)} />

      <p className="td-field-lbl">{t('tileDrill.tasks.projectLbl')}</p>
      <MultiPills items={projects} selected={filters.projectIds} onChange={(v) => setFilter('projectIds', v)} allLabel={t('tileDrill.all')} emptyLabel={t('tileDrill.tasks.noProjects')} />

      <p className="td-field-lbl">{t('tileDrill.tasks.clientScopeLbl')}</p>
      <Pills options={TASK_CLIENT_SCOPE} value={filters.clientScope || 'all'}
             label={(k) => t(`tileDrill.taskClientScope.${k}`)}
             onChange={(v) => setFilter('clientScope', v)} />

      <p className="td-section-lbl">{t('tileDrill.tasks.upcomingSection')}</p>
      <div className="td-list">
        {filtered.length === 0 ? (
          <p className="td-empty">{t('tileDrill.tasks.emptyFilter')}</p>
        ) : (
          filtered.slice(0, 8).map((tk) => (
            <div key={tk.id} className="td-list-row">
              <span className="td-list-name">{tk.title}</span>
              <span className={`td-list-meta priority-${tk.priority || 'low'}`}>
                {['high', 'medium', 'low'].includes(tk.priority) ? t(`tileDrill.priorities.${tk.priority}`) : ''}
              </span>
            </div>
          ))
        )}
        {filtered.length > 8 && (
          <p className="td-list-more">{t('tileDrill.tasks.moreCount', { count: filtered.length - 8 })}</p>
        )}
      </div>
    </>
  )
}

/* Today's agenda panel — the "פגישות היום" tile. Filters control which
   kinds are counted/shown (meeting / Google event / lead follow-up), and
   each row carries kind-aware actions: WhatsApp reminder, open the
   client/lead, and (meetings only) mark "happened". */
function MeetingsPanel({ filters, setFilter, items, onConfirm, onOpen, waMsg, t }) {
  const kinds = filters.kinds && filters.kinds.length ? filters.kinds : TODAY_KINDS
  return (
    <>
      <p className="td-num mono">{items.length}</p>
      <p className="td-num-lbl">{t('tileDrill.today.matchingNum')}</p>

      <p className="td-field-lbl">{t('tileDrill.today.kindsLbl')}</p>
      <Pills options={TODAY_KINDS} value={kinds} multi
             label={(k) => t(`tileDrill.todayKinds.${k}`)}
             onChange={(v) => setFilter('kinds', v.length ? v : TODAY_KINDS)} />

      <p className="td-section-lbl">{t('tileDrill.today.listSection')}</p>
      <div className="td-list">
        {items.length === 0 ? (
          <p className="td-empty">{t('tileDrill.today.empty')}</p>
        ) : (
          items.map((it) => (
            <div key={it.id} className={`td-today-row kind-${it.kind}`}>
              <button
                type="button"
                className="td-today-main"
                onClick={() => onOpen(it)}
                disabled={it.kind === 'calendar'}
              >
                <span className="td-today-time mono">{it.allDay ? t('tileDrill.today.allDay') : fmtTime(it.when)}</span>
                <span className="td-today-name">{it.title || t(`tileDrill.todayKinds.${it.kind}`)}</span>
                <span className={`td-today-kind kind-${it.kind}`}>{t(`tileDrill.todayKinds.${it.kind}`)}</span>
              </button>
              <div className="td-today-acts">
                {it.phone && (
                  <WhatsAppButton
                    phone={it.phone}
                    message={waMsg(it.kind === 'followup' ? 'lead' : 'client', { name: it.title })}
                    triggerClassName="td-today-act"
                  />
                )}
                {it.kind === 'meeting' && (
                  <button
                    type="button"
                    className="td-today-act confirm"
                    onClick={() => onConfirm(it)}
                    aria-label={t('tileDrill.today.markHappened')}
                    title={t('tileDrill.today.markHappened')}
                  >
                    <Check size={15} strokeWidth={2} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          ))
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
  meetings = [], calendarEvents = [], leads = [], sessions = [], addSession, updateMeeting, waMsg,
}) {
  const { t } = useT('modalsSystem')
  const navigate = useNavigate()
  const allFilters = getTileFilters(prefs)
  const filters = allFilters[tile] || {}

  const setFilter = (key, value) => {
    const nextTile = { ...filters, [key]: value }
    updatePrefs?.({ tileFilters: { ...(prefs?.tileFilters || {}), [tile]: nextTile } })
  }

  /* todayItems only reads `kinds`; depend on that stable array (from
     getTileFilters → prefs or the module default) rather than the
     per-render `filters` object, so the memo actually memoizes. */
  const todayKinds = filters.kinds
  const todayList = useMemo(
    () => (tile === 'today' ? todayItems(new Date(), { meetings, calendarEvents, leads, clients, groups }, { kinds: todayKinds }) : []),
    [tile, meetings, calendarEvents, leads, clients, groups, todayKinds],
  )
  /* "Happened" materializes a session + flips the meeting to confirmed —
     the shared helper used by the home review widget and the calendar. */
  const confirmToday = (it) => {
    if (it.meeting && addSession && updateMeeting) {
      confirmScheduledMeeting({ meeting: it.meeting, sessions, addSession, updateMeeting })
    }
  }
  /* Tap a row → jump to where it lives. Google events are read-only (the
     row's main button is disabled), so only meetings/follow-ups route. */
  const openToday = (it) => {
    if (it.kind === 'meeting' && it.subjectType === 'client') navigate(ROUTES.CLIENT.replace(':id', it.subjectId))
    else if (it.kind === 'meeting') navigate(ROUTES.CLIENTS)
    else if (it.kind === 'followup') navigate(ROUTES.LEADS)
    else return
    onClose()
  }

  const routes = {
    clients: ROUTES.CLIENTS,
    net: ROUTES.FINANCE,
    tasks: ROUTES.TASKS,
    today: ROUTES.CALENDAR,
  }

  return (
    <Modal open={open} onClose={onClose} title={tile ? t(`tileDrill.titles.${tile}`) : ''}>
      <div className="td-body">
        {tile === 'clients' && (
          <ClientsPanel
            filters={filters}
            setFilter={setFilter}
            clients={clients}
            projects={projects}
            groups={groups}
            t={t}
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
            t={t}
          />
        )}
        {tile === 'tasks' && (
          <TasksPanel
            filters={filters}
            setFilter={setFilter}
            tasks={tasks}
            projects={projects}
            t={t}
          />
        )}
        {tile === 'today' && (
          <MeetingsPanel
            filters={filters}
            setFilter={setFilter}
            items={todayList}
            onConfirm={confirmToday}
            onOpen={openToday}
            waMsg={waMsg}
            t={t}
          />
        )}
      </div>

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose}>{t('tileDrill.close')}</button>
        <button
          type="button"
          className="m-btn-save"
          onClick={() => { navigate(routes[tile]); onClose() }}
        >
          <ArrowLeft size={14} strokeWidth={1.8} aria-hidden="true" /> {t('tileDrill.openFull')}
        </button>
      </div>
    </Modal>
  )
}
