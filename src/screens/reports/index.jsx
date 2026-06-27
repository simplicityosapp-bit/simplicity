import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3, Moon, List, Table2, Settings, X, GripVertical, RotateCcw,
  Leaf, ArrowRight, TrendingUp, Users, CircleCheck, XCircle,
  Calendar, ArrowDownCircle, ArrowUpCircle, Coins,
  Check, CircleAlert, ChevronLeft,
} from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import {
  REPORT_METRICS, REPORT_GROUPS,
  computeReportForRange, getLast12Months, getPeriodsForMonths,
  formatReportValue, getOrderedVisibleMetrics, computeReportSummary,
  getAllOrderedMetrics, getDrillRecords,
} from '../../lib/reports'
import Modal from '../../modals/Modal'
import InfoPopover from '../../components/InfoPopover'
import { useReportsConfig } from '../../hooks/useReportsConfig'
import { useLeads } from '../../hooks/useLeads'
import { useClients } from '../../hooks/useClients'
import { useSessions } from '../../hooks/useSessions'
import { useTransactions } from '../../hooks/useTransactions'
import { useTasks } from '../../hooks/useTasks'
import { useGroupMembers } from '../../hooks/useGroupMembers'
import { useGroups } from '../../hooks/useGroups'
import { useT } from '../../i18n/useT'
import './ReportsScreen.css'

/* Per-metric icon mapping (Lucide). Kept here so the lib stays icon-free. */
const METRIC_ICONS = {
  newInquiries:       Leaf,
  leadsClosed:        XCircle,
  leadsConverted:     ArrowRight,
  conversionRate:     TrendingUp,
  newClients:         Users,
  activeClientsAtEnd: CircleCheck,
  leftMidProcessPct:  CircleAlert,
  sessions:           Calendar,
  income:             ArrowDownCircle,
  expense:            ArrowUpCircle,
  net:                Coins,
  tasksCompleted:     Check,
  openTasksAtEnd:     CircleAlert,
}

function MetricIcon({ id, size = 14 }) {
  const Comp = METRIC_ICONS[id] || BarChart3
  return <Comp size={size} strokeWidth={1.6} aria-hidden="true" />
}

export default function ReportsScreen() {
  const { t } = useT('reports')
  const navigate = useNavigate()
  const { config, setView, setRange, toggleMetric, reorderMetric, resetConfig } = useReportsConfig()
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [drill, setDrill] = useState(null)  /* { metricId, period } | null */
  const { leads, loading: leadsLoading } = useLeads()
  const { clients, loading: clientsLoading } = useClients()
  const { sessions, loading: sessionsLoading } = useSessions()
  const { transactions, loading: txLoading } = useTransactions()
  const { tasks, loading: tasksLoading } = useTasks()
  const { members: groupMembers, loading: gmLoading } = useGroupMembers()
  const { groups, loading: groupsLoading } = useGroups()
  /* First-load gate: until the core data arrives every metric computes as 0, so
     the screen would flash the "no activity" empty state + a misleading
     "go to month X" suggestion. Hold a loading placeholder instead. */
  const loading = leadsLoading || clientsLoading || sessionsLoading || txLoading || tasksLoading || gmLoading || groupsLoading

  const data = useMemo(
    () => ({ leads, clients, sessions, transactions, tasks, groupMembers, groups }),
    [leads, clients, sessions, transactions, tasks, groupMembers, groups],
  )

  const openDrill = (metricId, period) => setDrill({ metricId, period })

  return (
    <div className="screen">
      <div className="rep-head">
        <div className="rep-head-title">
          <BarChart3 size={20} strokeWidth={1.5} aria-hidden="true" /> {t('title')}
        </div>
        <button type="button" className="rep-head-link" onClick={() => navigate(ROUTES.MOON_GLANCE)}>
          <Moon size={16} strokeWidth={1.6} aria-hidden="true" /> {t('moonGlance')}
        </button>
      </div>

      <div className="rep-controls">
        <div className="rep-view-toggle" role="tablist" aria-label={t('view.selectAria')}>
          <button
            type="button"
            className={`rep-view-btn${config.view === 'list' ? ' on' : ''}`}
            role="tab"
            aria-selected={config.view === 'list'}
            onClick={() => setView('list')}
          >
            <List size={14} strokeWidth={1.6} aria-hidden="true" /> {t('view.list')}
          </button>
          <button
            type="button"
            className={`rep-view-btn${config.view === 'table' ? ' on' : ''}`}
            role="tab"
            aria-selected={config.view === 'table'}
            onClick={() => setView('table')}
          >
            <Table2 size={14} strokeWidth={1.6} aria-hidden="true" /> {t('view.table')}
          </button>
        </div>
        <button
          type="button"
          className={`rep-cog${customizeOpen ? ' on' : ''}`}
          aria-label={t('customize.label')}
          title={t('customize.label')}
          aria-expanded={customizeOpen}
          onClick={() => setCustomizeOpen((v) => !v)}
        >
          <Settings size={16} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>

      {customizeOpen && (
        <CustomizePanel
          config={config}
          onToggle={toggleMetric}
          onReorder={reorderMetric}
          onReset={resetConfig}
          onClose={() => setCustomizeOpen(false)}
        />
      )}

      {loading ? (
        <div className="rep-empty">
          <span className="rep-empty-icon"><BarChart3 size={28} strokeWidth={1.3} aria-hidden="true" /></span>
          <p className="rep-empty-text">{t('loading')}</p>
        </div>
      ) : config.view === 'list' ? (
        <ListView config={config} data={data} onDrill={openDrill} />
      ) : (
        <TableView config={config} data={data} onSetRange={setRange} onDrill={openDrill} />
      )}

      <DrillModal
        open={!!drill}
        onClose={() => setDrill(null)}
        drill={drill}
        data={data}
        onNavigate={(to) => { setDrill(null); navigate(to) }}
      />
    </div>
  )
}

/* ── LIST VIEW ───────────────────────────────────────────────────
   12-month pill row + a single-month detail card. Empty months
   suggest navigating to the most recent month with data. */
function ListView({ config, data, onDrill }) {
  const { t, lang } = useT('reports')
  const months = useMemo(() => getLast12Months(undefined, lang), [lang])
  const [selected, setSelected] = useState(months[months.length - 1])

  const selectedReport = useMemo(
    () => computeReportForRange(selected.start, selected.end, data),
    [selected, data],
  )

  const ordered = useMemo(() => getOrderedVisibleMetrics(config), [config])

  /* Empty month → suggest a different month, but only if any other
     month in the 12-strip has activity. */
  const isEmpty = ordered.every((m) => {
    const v = selectedReport.metrics[m.id]
    return v === null || v === undefined || v === 0
  })

  /* Lazy: only when the selected month is empty do we scan other months
     for activity — newest first, stopping at the first hit. This avoids
     computing all 12 monthly reports on every mount (the common case is
     a non-empty month, where we compute nothing extra). */
  const suggested = useMemo(() => {
    if (!isEmpty) return null
    for (let i = months.length - 1; i >= 0; i -= 1) {
      const p = months[i]
      if (p.year === selected.year && p.month === selected.month) continue
      const report = computeReportForRange(p.start, p.end, data)
      const hasData = ordered.some((m) => {
        const v = report.metrics[m.id]
        return v !== null && v !== undefined && v !== 0
      })
      if (hasData) return p
    }
    return null
  }, [isEmpty, months, selected, data, ordered])

  /* Group metrics by their group, in the user's order. */
  const grouped = useMemo(() => {
    const byId = new Map(REPORT_GROUPS.map((g) => [g.id, { ...g, items: [] }]))
    ordered.forEach((m) => {
      if (byId.has(m.group)) byId.get(m.group).items.push(m)
    })
    return [...byId.values()].filter((g) => g.items.length > 0)
  }, [ordered])

  return (
    <>
      <div className="rep-pills" role="tablist" aria-label={t('list.selectMonthAria')}>
        {months.map((p) => {
          const on = p.year === selected.year && p.month === selected.month
          return (
            <button
              key={`${p.year}-${p.month}`}
              type="button"
              role="tab"
              aria-selected={on}
              className={`rep-pill${on ? ' on' : ''}`}
              onClick={() => setSelected(p)}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      <p className="rep-period-title">{selected.label}</p>

      {isEmpty ? (
        <div className="rep-empty">
          <span className="rep-empty-icon"><BarChart3 size={28} strokeWidth={1.3} aria-hidden="true" /></span>
          <p className="rep-empty-text">{t('list.empty')}</p>
          {suggested && (
            <button type="button" className="rep-empty-cta" onClick={() => setSelected(suggested)}>
              {t('list.goToMonth', { label: suggested.label })}
            </button>
          )}
        </div>
      ) : (
        <div className="rep-groups">
          {grouped.map((g) => (
            <div key={g.id} className="rep-group">
              <p className="rep-group-head">{t(`groups.${g.id}`)}</p>
              <div className="rep-list">
                {g.items.map((m) => {
                  const v = selectedReport.metrics[m.id]
                  const empty = v === null || v === undefined || v === 0
                  return (
                    <div key={m.id} className={`rep-row-wrap${empty ? ' empty' : ''}`}>
                      <button
                        type="button"
                        className={`rep-row${empty ? ' empty' : ''}`}
                        onClick={() => !empty && onDrill(m.id, selected)}
                        disabled={empty}
                      >
                        <span className="rep-row-icon"><MetricIcon id={m.id} /></span>
                        <span className="rep-row-label">{t(`metrics.${m.id}`)}</span>
                        <span className="rep-row-value mono">{formatReportValue(m, v)}</span>
                      </button>
                      {m.info && <span className="rep-row-info"><InfoPopover label={t('info', { label: t(`metrics.${m.id}`) })} text={t(`metricsDesc.${m.id}`)} /></span>}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ── TABLE VIEW ──────────────────────────────────────────────────
   Range pills (3/6/12) + a wide table: sticky-right metric column,
   one column per period, plus a summary column. Group-header rows
   appear above each contiguous run of metrics from the same group. */
function TableView({ config, data, onSetRange, onDrill }) {
  const { t, lang } = useT('reports')
  const periods = useMemo(() => getPeriodsForMonths(config.range, undefined, lang), [config.range, lang])
  const periodReports = useMemo(
    () => periods.map((p) => ({ ...p, data: computeReportForRange(p.start, p.end, data) })),
    [periods, data],
  )
  const ordered = useMemo(() => getOrderedVisibleMetrics(config), [config])
  const groupLabels = useMemo(
    () => Object.fromEntries(REPORT_GROUPS.map((g) => [g.id, t(`groups.${g.id}`)])),
    [t],
  )

  const periodLabel = periods.length > 1
    ? `${periods[0].label} – ${periods[periods.length - 1].label}`
    : periods[0].label

  /* Build rows in the user's order; insert a group-header row whenever
     the group changes (matches the prototype semantics). */
  const rows = []
  let lastGroup = null
  ordered.forEach((m) => {
    if (m.group !== lastGroup) {
      rows.push({ kind: 'group', id: `g-${m.group}`, label: groupLabels[m.group] || m.group })
      lastGroup = m.group
    }
    rows.push({ kind: 'metric', metric: m })
  })

  if (!rows.length) {
    return (
      <>
        <RangePills range={config.range} onSetRange={onSetRange} />
        <p className="rep-period-title">{periodLabel}</p>
        <div className="rep-empty">
          <p className="rep-empty-text">{t('table.noMetrics')}</p>
        </div>
      </>
    )
  }

  return (
    <>
      <RangePills range={config.range} onSetRange={onSetRange} />
      <p className="rep-period-title">{periodLabel}</p>
      <div className="rep-table-wrap">
        <table className="rep-table">
          <thead>
            <tr>
              <th className="rep-th-metric">{t('table.metric')}</th>
              {periodReports.map((p) => (
                <th key={`${p.year}-${p.month}`} className={`rep-th-period${p.isCurrent ? ' current' : ''}`}>
                  {p.label}
                </th>
              ))}
              <th className="rep-th-summary">{t('table.summary')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              if (r.kind === 'group') {
                return (
                  <tr key={r.id} className="rep-tr-group">
                    <td colSpan={periodReports.length + 2}>{r.label}</td>
                  </tr>
                )
              }
              const m = r.metric
              const summary = computeReportSummary(m, periodReports)
              return (
                <tr key={m.id} className="rep-tr-metric">
                  <td className="rep-td-metric">
                    <span className="rep-td-metric-icon"><MetricIcon id={m.id} size={13} /></span>
                    <span className="rep-td-metric-name">{t(`metrics.${m.id}`)}</span>
                    {m.info && <InfoPopover label={t('info', { label: t(`metrics.${m.id}`) })} text={t(`metricsDesc.${m.id}`)} />}
                  </td>
                  {periodReports.map((p) => {
                    const v = p.data.metrics[m.id]
                    const empty = v === null || v === undefined || v === 0
                    return (
                      <td
                        key={`${p.year}-${p.month}`}
                        className={`rep-td-cell${p.isCurrent ? ' current' : ''}${empty ? '' : ' clickable'}`}
                        onClick={empty ? undefined : () => onDrill(m.id, p)}
                      >
                        <span className="mono">{formatReportValue(m, v)}</span>
                      </td>
                    )
                  })}
                  <td className="rep-td-summary">
                    <span className="mono">{formatReportValue(m, summary)}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

function RangePills({ range, onSetRange }) {
  const { t } = useT('reports')
  return (
    <div className="rep-range-row">
      <span className="rep-range-label">{t('table.monthsBack')}</span>
      <div className="rep-range-group">
        {[3, 6, 12].map((n) => (
          <button
            key={n}
            type="button"
            className={`rep-range-pill${range === n ? ' on' : ''}`}
            onClick={() => onSetRange(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── CUSTOMIZE PANEL ─────────────────────────────────────────────
   Inline panel under the controls. Toggle each metric's visibility +
   drag the grip to reorder. Reset wipes back to factory defaults. */
function CustomizePanel({ config, onToggle, onReorder, onReset, onClose }) {
  const { t } = useT('reports')
  const items = useMemo(() => getAllOrderedMetrics(config), [config])
  const visible = useMemo(() => new Set(config.visibleMetrics), [config.visibleMetrics])
  const [draggingId, setDraggingId] = useState(null)
  const [overId, setOverId] = useState(null)

  const handleDragStart = (e, id) => {
    setDraggingId(id)
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id) } catch { /* noop */ }
  }
  const handleDragOver = (e, id) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (id !== overId) setOverId(id)
  }
  const handleDrop = (e, id) => {
    e.preventDefault()
    if (draggingId && draggingId !== id) onReorder(draggingId, id)
    setDraggingId(null)
    setOverId(null)
  }
  const handleDragEnd = () => { setDraggingId(null); setOverId(null) }

  return (
    <div className="rep-cust" role="region" aria-label={t('customize.regionAria')}>
      <div className="rep-cust-head">
        <span className="rep-cust-title">{t('customize.title')}</span>
        <button type="button" className="rep-cust-reset" onClick={onReset} title={t('customize.resetTitle')}>
          <RotateCcw size={12} strokeWidth={1.6} aria-hidden="true" /> {t('customize.reset')}
        </button>
        <button type="button" className="rep-cust-close" aria-label={t('customize.close')} onClick={onClose}>
          <X size={14} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
      <p className="rep-cust-hint">{t('customize.hint')}</p>
      <div className="rep-cust-list">
        {items.map((m) => {
          const on = visible.has(m.id)
          return (
            <div
              key={m.id}
              className={`rep-cust-row${on ? ' on' : ''}${draggingId === m.id ? ' dragging' : ''}${overId === m.id ? ' over' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, m.id)}
              onDragOver={(e) => handleDragOver(e, m.id)}
              onDrop={(e) => handleDrop(e, m.id)}
              onDragEnd={handleDragEnd}
            >
              <span className="rep-cust-grip" aria-hidden="true">
                <GripVertical size={14} strokeWidth={1.5} />
              </span>
              <span className="rep-cust-icon"><MetricIcon id={m.id} /></span>
              <span className="rep-cust-label">{t(`metrics.${m.id}`)}</span>
              <button
                type="button"
                className={`rep-cust-toggle${on ? ' on' : ''}`}
                aria-label={on ? t('customize.hide', { label: t(`metrics.${m.id}`) }) : t('customize.show', { label: t(`metrics.${m.id}`) })}
                onClick={() => onToggle(m.id)}
              >
                <span className="rep-cust-toggle-knob" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── DRILL-DOWN MODAL ───────────────────────────────────────────
   Opens when a metric row (list view) or cell (table view) is
   clicked. Shows the underlying records — each row links to the
   relevant screen via onNavigate. */
const DRILL_ROW_ICONS = {
  leaf: Leaf,
  x: XCircle,
  arrow: ArrowRight,
  users: Users,
  user: Users,
  check: Check,
  calendar: Calendar,
  arrowDown: ArrowDownCircle,
  arrowUp: ArrowUpCircle,
  circleAlert: CircleAlert,
}

function DrillRowIcon({ name }) {
  const Comp = DRILL_ROW_ICONS[name] || BarChart3
  return <Comp size={14} strokeWidth={1.6} aria-hidden="true" />
}

function DrillModal({ open, onClose, drill, data, onNavigate }) {
  const { t } = useT('reports')
  const records = useMemo(() => {
    if (!drill) return []
    return getDrillRecords(drill.metricId, drill.period.start, drill.period.end, data)
  }, [drill, data])

  const metric = drill ? REPORT_METRICS.find((m) => m.id === drill.metricId) : null
  const title = metric && drill ? `${t(`metrics.${metric.id}`)} · ${drill.period.label}` : t('drill.title')

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="rep-drill-count">
        {t('drill.count', { count: records.length })}
      </p>
      {records.length === 0 ? (
        <div className="rep-drill-empty">{t('drill.empty')}</div>
      ) : (
        <div className="rep-drill-list">
          {records.map((r, i) => (
            <button
              key={`${r.primary}-${i}`}
              type="button"
              className="rep-drill-row"
              onClick={() => onNavigate(r.navigateTo)}
            >
              <span className="rep-drill-row-icon"><DrillRowIcon name={r.icon} /></span>
              <span className="rep-drill-row-text">
                <span className="rep-drill-row-primary">{r.primary}</span>
                <span className="rep-drill-row-secondary">{r.secondary}</span>
              </span>
              <span className="rep-drill-row-chev"><ChevronLeft size={16} strokeWidth={1.5} aria-hidden="true" /></span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
