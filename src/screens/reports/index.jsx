import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3, Moon, List, Table2, Settings, X, GripVertical, RotateCcw,
  Leaf, ArrowRight, TrendingUp, Users, CircleCheck, XCircle,
  Calendar, ArrowDownCircle, ArrowUpCircle, Coins,
  Check, CircleAlert,
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
import { useAddress } from '../../hooks/useAddress'
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
  const navigate = useNavigate()
  const { config, setView, setRange, toggleMetric, reorderMetric, resetConfig } = useReportsConfig()
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [drill, setDrill] = useState(null)  /* { metricId, period } | null */
  const { leads } = useLeads()
  const { clients } = useClients()
  const { sessions } = useSessions()
  const { transactions } = useTransactions()
  const { tasks } = useTasks()
  const { members: groupMembers } = useGroupMembers()
  const { groups } = useGroups()

  const data = useMemo(
    () => ({ leads, clients, sessions, transactions, tasks, groupMembers, groups }),
    [leads, clients, sessions, transactions, tasks, groupMembers, groups],
  )

  const openDrill = (metricId, period) => setDrill({ metricId, period })

  return (
    <div className="screen">
      <div className="rep-head">
        <div className="rep-head-title">
          <BarChart3 size={20} strokeWidth={1.5} aria-hidden="true" /> דוחות
        </div>
        <button type="button" className="rep-head-link" onClick={() => navigate(ROUTES.MOON_GLANCE)}>
          <Moon size={16} strokeWidth={1.6} aria-hidden="true" /> מבט על
        </button>
      </div>

      <div className="rep-controls">
        <div className="rep-view-toggle" role="tablist" aria-label="בחירת תצוגה">
          <button
            type="button"
            className={`rep-view-btn${config.view === 'list' ? ' on' : ''}`}
            role="tab"
            aria-selected={config.view === 'list'}
            onClick={() => setView('list')}
          >
            <List size={14} strokeWidth={1.6} aria-hidden="true" /> רשימה
          </button>
          <button
            type="button"
            className={`rep-view-btn${config.view === 'table' ? ' on' : ''}`}
            role="tab"
            aria-selected={config.view === 'table'}
            onClick={() => setView('table')}
          >
            <Table2 size={14} strokeWidth={1.6} aria-hidden="true" /> טבלה
          </button>
        </div>
        <button
          type="button"
          className={`rep-cog${customizeOpen ? ' on' : ''}`}
          aria-label="התאמת תצוגה"
          title="התאמת תצוגה"
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

      {config.view === 'list' ? (
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
  const months = useMemo(() => getLast12Months(), [])
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
      <div className="rep-pills" role="tablist" aria-label="בחירת חודש">
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
          <p className="rep-empty-text">אין נתונים לחודש הזה</p>
          {suggested && (
            <button type="button" className="rep-empty-cta" onClick={() => setSelected(suggested)}>
              ← עבור ל{suggested.label}
            </button>
          )}
        </div>
      ) : (
        <div className="rep-groups">
          {grouped.map((g) => (
            <div key={g.id} className="rep-group">
              <p className="rep-group-head">{g.label}</p>
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
                        <span className="rep-row-label">{m.label}</span>
                        <span className="rep-row-value mono">{formatReportValue(m, v)}</span>
                      </button>
                      {m.desc && <span className="rep-row-info"><InfoPopover label={`הסבר על ${m.label}`} text={m.desc} /></span>}
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
  const { addr } = useAddress()
  const periods = useMemo(() => getPeriodsForMonths(config.range), [config.range])
  const periodReports = useMemo(
    () => periods.map((p) => ({ ...p, data: computeReportForRange(p.start, p.end, data) })),
    [periods, data],
  )
  const ordered = useMemo(() => getOrderedVisibleMetrics(config), [config])
  const groupLabels = useMemo(
    () => Object.fromEntries(REPORT_GROUPS.map((g) => [g.id, g.label])),
    [],
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
          <p className="rep-empty-text">אין מדדים פעילים — {addr({male:'לחץ',female:'לחצי',neutral:'לחץ/י'})} על גלגל השיניים כדי להציג מדדים</p>
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
              <th className="rep-th-metric">מדד</th>
              {periodReports.map((p) => (
                <th key={`${p.year}-${p.month}`} className={`rep-th-period${p.isCurrent ? ' current' : ''}`}>
                  {p.label}
                </th>
              ))}
              <th className="rep-th-summary">סיכום</th>
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
                    <span className="rep-td-metric-name">{m.label}</span>
                    {m.desc && <InfoPopover label={`הסבר על ${m.label}`} text={m.desc} />}
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
  return (
    <div className="rep-range-row">
      <span className="rep-range-label">חודשים אחורה:</span>
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
  const { addr } = useAddress()
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
    <div className="rep-cust" role="region" aria-label="התאמת תצוגה">
      <div className="rep-cust-head">
        <span className="rep-cust-title">התאמת תצוגה</span>
        <button type="button" className="rep-cust-reset" onClick={onReset} title="חזרה לברירת המחדל">
          <RotateCcw size={12} strokeWidth={1.6} aria-hidden="true" /> ברירת מחדל
        </button>
        <button type="button" className="rep-cust-close" aria-label="סגירה" onClick={onClose}>
          <X size={14} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
      <p className="rep-cust-hint">{addr({male:'סמן',female:'סמני',neutral:'סמנ/י'})} אילו מדדים להציג, {addr({male:'וגרר',female:'וגררי',neutral:'וגרר/י'})} לסידור מחדש.</p>
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
              <span className="rep-cust-label">{m.label}</span>
              <button
                type="button"
                className={`rep-cust-toggle${on ? ' on' : ''}`}
                aria-label={on ? `הסתר ${m.label}` : `הצג ${m.label}`}
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
  const records = useMemo(() => {
    if (!drill) return []
    return getDrillRecords(drill.metricId, drill.period.start, drill.period.end, data)
  }, [drill, data])

  const metric = drill ? REPORT_METRICS.find((m) => m.id === drill.metricId) : null
  const title = metric && drill ? `${metric.label} · ${drill.period.label}` : 'פרטים'

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="rep-drill-count">
        {records.length} {records.length === 1 ? 'רשומה' : 'רשומות'}
      </p>
      {records.length === 0 ? (
        <div className="rep-drill-empty">אין רשומות לתקופה הזו</div>
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
              <span className="rep-drill-row-chev">›</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
