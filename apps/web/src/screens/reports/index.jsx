import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3, Eye, List, Table2, Settings, X, GripVertical, RotateCcw,
  Leaf, ArrowRight, TrendingUp, Users, CircleCheck, XCircle,
  Calendar, ArrowDownCircle, ArrowUpCircle, Coins,
  Check, CircleAlert, ChevronLeft, CloudOff, ChevronUp, ChevronDown,
  ArrowUp, ArrowDown, Download,
} from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import {
  REPORT_METRICS, REPORT_GROUPS,
  computeReportForRange, getLast12Months, getPeriodsForMonths,
  formatReportValue, getOrderedVisibleMetrics, computeReportSummary,
  getAllOrderedMetrics, getDrillRecords,
  getPreviousPeriod, computeReportDelta, reportDeltaTone, formatReportDelta,
} from '@simplicity/core'
import Modal from '../../modals/Modal'
import ConfirmModal from '../../modals/ConfirmModal'
import { exportReportCSV } from '../../lib/export'
import InfoPopover from '../../components/InfoPopover'
import { useReportsConfig } from '../../hooks/useReportsConfig'
import { useReportsData } from '../../hooks/useReportsData'
import { useT } from '../../i18n/useT'
import './ReportsScreen.css'
import { Box, Txt, Btn } from '../../components/ui'

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

/* A negative figure is the one number on this screen whose meaning reverses,
   and it was painted in the same espresso as every other. Clay marks it, via
   --clay-on-dark: plain clay in daylight, and a legible salmon at night where
   deep wine is unreadable as text. Same treatment the finance screen gives
   its net. Money only — a percentage here cannot go negative and a count
   never drops below zero. */
const negCls = (metric, val) => (
  metric.format === 'money' && typeof val === 'number' && val < 0 ? ' neg' : ''
)

/* What a figure looks like in the exported FILE, as opposed to on screen.
   Raw and unadorned: the file exists to be opened in a spreadsheet and
   summed, and "₪1,200" is text to Excel where 1200.00 is money. A metric
   with no value for a period leaves the cell empty rather than writing 0,
   which would be a different claim. */
const exportValue = (metric, val) => {
  if (typeof val !== 'number') return ''
  return metric.format === 'money' ? val.toFixed(2) : String(val)
}

/* YYYY-MM, for the exported filename. */
const periodSlug = (p) => `${p.year}-${String(p.month + 1).padStart(2, '0')}`

/* A small text button beside the period title. It sits there rather than in
   the controls row because the row is already 276px of a 327px phone, and
   because the title is what the export is OF — the button reads as "export
   this period". */
function ExportButton({ onExport }) {
  const { t } = useT('reports')
  return (
    <Btn type="button" className="rep-export" aria-label={t('exportAria')} onClick={onExport}>
      <Download size={14} strokeWidth={1.7} aria-hidden="true" />
      {t('exportLabel')}
    </Btn>
  )
}

/* Twelve months of one metric, as a 40x16 line.

   aria-hidden on purpose. Every point it draws is already available as a
   number — this row states the latest one and its change, and the table view
   lays out all twelve as columns. A screen reader gains nothing from the
   shape and would have to sit through twelve readings to reconstruct it, so
   the picture is left to the eyes that can use it.

   Months with no value are skipped rather than plotted as zero, and the line
   simply spans the gap: a month the practice has no figure for is unknown,
   not a dip to nothing. Under two real points there is no shape to draw and
   the slot stays empty rather than showing a misleading flat line.

   Scaled to its own min/max, so this says "the shape of your year", not "how
   big". The number beside it carries the magnitude. */
function MetricSpark({ series, selectedIdx }) {
  const W = 40
  const H = 16
  const PAD = 2
  const pts = series
    .map((v, i) => ({ i, v }))
    .filter((p) => typeof p.v === 'number')
  if (pts.length < 2) return <Txt className="rep-spark rep-spark-none" aria-hidden="true" />
  const vals = pts.map((p) => p.v)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const r1 = (n) => Math.round(n * 10) / 10
  const x = (i) => r1(PAD + (i / (series.length - 1)) * (W - 2 * PAD))
  const y = (v) => r1(max === min ? H / 2 : H - PAD - ((v - min) / (max - min)) * (H - 2 * PAD))
  const line = pts.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')
  const here = pts.find((p) => p.i === selectedIdx)
  return (
    <svg
      className="rep-spark"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <polyline className="rep-spark-line" points={line} />
      {here && <circle className="rep-spark-dot" cx={x(here.i)} cy={y(here.v)} r="2" />}
    </svg>
  )
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
  /* Hiding metrics is sticky and silent: switch ten of the thirteen off, come
     back next week, and the screen simply looks broken. The cog wears a dot
     while anything is hidden, and its tooltip says how many of how many are
     showing. */
  const shownCount = config.visibleMetrics.length
  const someHidden = shownCount < REPORT_METRICS.length
  const cogLabel = someHidden
    ? t('customize.labelHidden', { shown: shownCount, total: REPORT_METRICS.length })
    : t('customize.label')
  const [drill, setDrill] = useState(null)  /* { metricId, period } | null */
  /* One raw read of all seven tables rather than the app's editing hooks:
     those filter deleted_at server-side, which would hide the history this
     screen exists to report. See useReportsData. */
  const { leads, clients, sessions, transactions, tasks, groupMembers, groups, tallies, loading, unreachable, error, refetch, refetching } = useReportsData()

  const data = useMemo(
    () => ({ leads, clients, sessions, transactions, tasks, groupMembers, groups, tallies }),
    [leads, clients, sessions, transactions, tasks, groupMembers, groups, tallies],
  )

  const openDrill = (metricId, period) => setDrill({ metricId, period })

  return (
    <Box className="screen rep-screen">
      {/* The shared header card, not a bespoke one. Owner rule 2026-07-29: a
          screen header holds its name wearing its menu icon and nothing else —
          this screen had kept its own 22px/600 title with the "מבט על" link
          tucked inside the card. The link is not gone, it moved down to the
          controls row where the screen's other navigation lives. */}
      <Box className="screen-top">
        <Box as="header" className="screen-head">
          <Txt as="p" className="t-screen">
            <BarChart3 size={20} strokeWidth={1.6} aria-hidden="true" />
            {t('title')}
          </Txt>
        </Box>
      </Box>

      <Box className="rep-controls">
        <Box className="rep-view-toggle" role="tablist" aria-label={t('view.selectAria')}>
          <Btn
            type="button"
            className={`rep-view-btn${config.view === 'list' ? ' on' : ''}`}
            role="tab"
            aria-selected={config.view === 'list'}
            onClick={() => setView('list')}
          >
            <List size={14} strokeWidth={1.6} aria-hidden="true" /> {t('view.list')}
          </Btn>
          <Btn
            type="button"
            className={`rep-view-btn${config.view === 'table' ? ' on' : ''}`}
            role="tab"
            aria-selected={config.view === 'table'}
            onClick={() => setView('table')}
          >
            <Table2 size={14} strokeWidth={1.6} aria-hidden="true" /> {t('view.table')}
          </Btn>
        </Box>
        <Box className="rep-controls-end">
          <Btn type="button" className="rep-head-link" onClick={() => navigate(ROUTES.MOON_GLANCE)}>
            <Eye size={16} strokeWidth={1.6} aria-hidden="true" /> {t('moonGlance')}
          </Btn>
          <Btn
            type="button"
            className={`rep-cog${customizeOpen ? ' on' : ''}${someHidden ? ' has-hidden' : ''}`}
            aria-label={cogLabel}
            title={cogLabel}
            aria-expanded={customizeOpen}
            onClick={() => setCustomizeOpen((v) => !v)}
          >
            <Settings size={16} strokeWidth={1.6} aria-hidden="true" />
          </Btn>
        </Box>
      </Box>

      {customizeOpen && (
        <CustomizePanel
          config={config}
          onToggle={toggleMetric}
          onReorder={reorderMetric}
          onReset={resetConfig}
          onClose={() => setCustomizeOpen(false)}
        />
      )}

      {/* First-load gate: until the data arrives every metric computes as 0,
          so the screen would flash the "no activity" empty state + a
          misleading "go to month X" suggestion. Hold a placeholder instead. */}
      {loading ? (
        <Box className="rep-empty">
          <Txt className="rep-empty-icon"><BarChart3 size={28} strokeWidth={1.3} aria-hidden="true" /></Txt>
          <Txt as="p" className="rep-empty-text">{t('loading')}</Txt>
        </Box>
      ) : unreachable ? (
        /* A read that failed — or that never ran, e.g. offline — falls back to
           empty arrays, so every metric computes as 0 and the screen used to
           tell the user their practice had no activity. That is a false
           statement about their business, not a visible glitch. Say what
           actually happened instead, and offer the way out. The raw message
           rides in `title`, as on the tasks screen: it helps a bug report
           without putting a stack trace in front of the user (and is simply
           absent when there was no error to report). */
        <Box className="rep-empty">
          <Txt className="rep-empty-icon"><CloudOff size={28} strokeWidth={1.3} aria-hidden="true" /></Txt>
          <Txt as="p" className="rep-empty-text" title={error || undefined}>{t('loadError')}</Txt>
          <Btn
            type="button"
            className="empty-action"
            onClick={() => refetch()}
            disabled={refetching}
          >
            <RotateCcw size={18} strokeWidth={1.6} aria-hidden="true" />
            {refetching ? t('retrying') : t('retry')}
          </Btn>
        </Box>
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
    </Box>
  )
}

/* Month-on-month change, shown beside each figure in the list view.

   The arrow points the way the number MOVED; the colour says whether that
   was good news (owner call 2026-08-17). Those are not the same axis: more
   expenses, more open tasks at month end and a higher mid-process drop-out
   rate all point up and all read red. "Leads closed" has no good direction
   at all — closing covers both conversions and dead ends — so it moves
   without colouring.

   Nothing is drawn when either month lacks a value: an absent figure is an
   unknown, not a change of zero, and "no inquiries yet" must never render
   as "no change since last month". */
function MetricDelta({ metric, current, previous, prevLabel }) {
  const { t } = useT('reports')
  const delta = computeReportDelta(current, previous)
  if (delta === null) return null
  const tone = reportDeltaTone(metric, delta)
  const Arrow = delta > 0 ? ArrowUp : ArrowDown
  return (
    <Txt
      className={`rep-row-delta ${tone}`}
      title={t('list.deltaTitle', { period: prevLabel, value: formatReportValue(metric, previous) })}
    >
      {delta !== 0 && <Arrow size={11} strokeWidth={2.2} aria-hidden="true" />}
      {formatReportDelta(metric, delta)}
    </Txt>
  )
}
/* ── LIST VIEW ───────────────────────────────────────────────────
   12-month pill row + a single-month detail card. Empty months
   suggest navigating to the most recent month with data. */
function ListView({ config, data, onDrill }) {
  const { t, lang } = useT('reports')
  /* The export column headers live in the 'export' namespace with every other
     spreadsheet header, not in this screen's. lib/export registers that bundle
     for all four languages when it loads, and this screen imports it. */
  const { t: tExport } = useT('export')
  const months = useMemo(() => getLast12Months(undefined, lang), [lang])
  /* The chosen month is held as a plain {year, month} KEY, not as the period
     object. Those objects carry a localised label and are rebuilt whenever the
     language changes, so a stored one went stale on a switch: the pills
     relabelled while the card underneath kept the old language's month name
     until the user picked again. Resolving through `months` on every render
     keeps the two in step, and falls back to the newest month if the key ever
     drops out of the 12-month window — which it does at midnight on the 1st,
     with the app left open. */
  const [selectedKey, setSelectedKey] = useState(() => {
    const newest = months[months.length - 1]
    return { year: newest.year, month: newest.month }
  })
  const selected = useMemo(
    () => months.find((p) => p.year === selectedKey.year && p.month === selectedKey.month)
      || months[months.length - 1],
    [months, selectedKey],
  )
  const setSelected = useCallback((p) => setSelectedKey({ year: p.year, month: p.month }), [])

  /* The strip is 12 pills wide (~830px) inside a horizontal scroller, ordered
     oldest → newest, and the default selection is the NEWEST — i.e. the far
     end. On a phone the screen therefore opened showing five old months with
     nothing highlighted, while the card underneath reported the current one.
     Bring the selected pill into view instead: centred on first paint, and
     'nearest' afterwards so clicking a visible pill doesn't shunt the strip
     around. It also covers the empty state's "go to <month>" jump, which can
     land on a pill that is off-screen. block:'nearest' keeps the page itself
     still — only the strip scrolls. */
  const activePillRef = useRef(null)
  const centred = useRef(false)
  useEffect(() => {
    const el = activePillRef.current
    if (!el?.scrollIntoView) return
    el.scrollIntoView({ block: 'nearest', inline: centred.current ? 'nearest' : 'center' })
    centred.current = true
  }, [selected])

  /* All twelve months, computed once, and everything on this view reads from
     it: the selected month’s card, the change against the month before, the
     "go to <month>" suggestion, and the sparkline’s twelve points.

     This replaces two narrower calculations that each did their own pass. The
     old code deliberately computed ONLY the selected month and scanned the
     rest lazily, on the grounds that a non-empty month should cost nothing
     extra — a good trade until the sparkline arrived, which needs all twelve
     regardless. Memoised on the data bag, so it runs once per load, and the
     table view has always done exactly this at range 12. */
  const monthly = useMemo(
    () => months.map((p) => ({ period: p, report: computeReportForRange(p.start, p.end, data) })),
    [months, data],
  )
  const selectedIdx = useMemo(
    () => months.findIndex((p) => p.year === selected.year && p.month === selected.month),
    [months, selected],
  )
  const selectedReport = monthly[selectedIdx]?.report || monthly[monthly.length - 1].report

  /* The month before the selected one, so every figure can say which way it
     moved. Eleven of the twelve pills find it already computed in `monthly`;
     only the oldest pill reaches past the strip and pays for its own pass.
     The LIST view alone needs this — the table already puts the months side
     by side, where a delta column would repeat what the eye can do. */
  const prevPeriod = useMemo(() => getPreviousPeriod(selected, lang), [selected, lang])
  const prevReport = useMemo(
    () => (selectedIdx > 0
      ? monthly[selectedIdx - 1].report
      : computeReportForRange(prevPeriod.start, prevPeriod.end, data)),
    [selectedIdx, monthly, prevPeriod, data],
  )

  const ordered = useMemo(() => getOrderedVisibleMetrics(config), [config])

  /* Empty month → suggest a different month, but only if any other
     month in the 12-strip has activity. */
  const isEmpty = ordered.every((m) => {
    const v = selectedReport.metrics[m.id]
    return v === null || v === undefined || v === 0
  })

  /* Newest first, stopping at the first month with anything in it. Reads the
     reports already computed above rather than recomputing them. */
  const suggested = useMemo(() => {
    if (!isEmpty) return null
    for (let i = monthly.length - 1; i >= 0; i -= 1) {
      if (i === selectedIdx) continue
      const hasData = ordered.some((m) => {
        const v = monthly[i].report.metrics[m.id]
        return v !== null && v !== undefined && v !== 0
      })
      if (hasData) return monthly[i].period
    }
    return null
  }, [isEmpty, monthly, selectedIdx, ordered])

  /* Exports exactly what this view is showing: the visible metrics in the
     user's order, the selected month, and the change against the month
     before it — the same three things on screen, so the file and the screen
     never disagree. */
  const exportMonth = useCallback(() => {
    const rows = ordered.map((m) => [
      t(`metrics.${m.id}`),
      exportValue(m, selectedReport.metrics[m.id]),
      exportValue(m, computeReportDelta(selectedReport.metrics[m.id], prevReport.metrics[m.id])),
    ])
    exportReportCSV({
      columnLabels: [selected.label, tExport('headers.change')],
      rows,
      slug: periodSlug(selected),
    })
  }, [ordered, t, tExport, selectedReport, prevReport, selected])

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
      <Box className="rep-pills" role="tablist" aria-label={t('list.selectMonthAria')}>
        {months.map((p) => {
          const on = p.year === selected.year && p.month === selected.month
          return (
            <Btn
              key={`${p.year}-${p.month}`}
              ref={on ? activePillRef : null}
              type="button"
              role="tab"
              aria-selected={on}
              className={`rep-pill${on ? ' on' : ''}`}
              onClick={() => setSelected(p)}
            >
              {p.label}
            </Btn>
          )
        })}
      </Box>

      <Box className="rep-period-row">
        <Txt as="p" className="rep-period-title">{selected.label}</Txt>
        <ExportButton onExport={exportMonth} />
      </Box>

      {isEmpty ? (
        <Box className="rep-empty">
          <Txt className="rep-empty-icon"><BarChart3 size={28} strokeWidth={1.3} aria-hidden="true" /></Txt>
          <Txt as="p" className="rep-empty-text">{t('list.empty')}</Txt>
          {/* Calendar, not an arrow: a directional glyph has to flip between
              the RTL and LTR locales, and the string used to carry a literal
              "←" that pointed the wrong way in three of the four. The button
              goes to a month — say that instead. */}
          {suggested && (
            <Btn type="button" className="empty-action" onClick={() => setSelected(suggested)}>
              <Calendar size={18} strokeWidth={1.6} aria-hidden="true" />
              {t('list.goToMonth', { label: suggested.label })}
            </Btn>
          )}
        </Box>
      ) : (
        <Box className="rep-groups">
          {grouped.map((g) => (
            <Box key={g.id} className="rep-group">
              <Txt as="p" className="rep-group-head">{t(`groups.${g.id}`)}</Txt>
              <Box className="rep-list">
                {g.items.map((m) => {
                  const v = selectedReport.metrics[m.id]
                  const empty = v === null || v === undefined || v === 0
                  return (
                    <Box key={m.id} className={`rep-row-wrap${empty ? ' zero' : ''}`}>
                      <Btn
                        type="button"
                        className={`rep-row${empty ? ' zero' : ''}`}
                        onClick={() => !empty && onDrill(m.id, selected)}
                        disabled={empty}
                      >
                        <Txt className="rep-row-icon"><MetricIcon id={m.id} /></Txt>
                        <Txt className="rep-row-label">{t(`metrics.${m.id}`)}</Txt>
                        <MetricSpark
                          series={monthly.map((x) => x.report.metrics[m.id])}
                          selectedIdx={selectedIdx}
                        />
                        <Txt className={`rep-row-value mono${negCls(m, v)}`}>{formatReportValue(m, v)}</Txt>
                        <MetricDelta
                          metric={m}
                          current={v}
                          previous={prevReport.metrics[m.id]}
                          prevLabel={prevPeriod.label}
                        />
                      </Btn>
                      {m.info && <Txt className="rep-row-info"><InfoPopover label={t('info', { label: t(`metrics.${m.id}`) })} text={t(`metricsDesc.${m.id}`)} /></Txt>}
                    </Box>
                  )
                })}
              </Box>
            </Box>
          ))}
        </Box>
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

  /* The same grid the table is drawing: a column per period plus the summary,
     in the order they appear on screen. Group header rows are left out — they
     are a reading aid, and a spreadsheet has its own. */
  const exportGrid = useCallback(() => {
    const rows = ordered.map((m) => [
      t(`metrics.${m.id}`),
      ...periodReports.map((p) => exportValue(m, p.data.metrics[m.id])),
      exportValue(m, computeReportSummary(m, periodReports)),
    ])
    const first = periods[0]
    const last = periods[periods.length - 1]
    exportReportCSV({
      columnLabels: [...periods.map((p) => p.label), t('table.summary')],
      rows,
      slug: periods.length > 1 ? `${periodSlug(first)}_${periodSlug(last)}` : periodSlug(first),
    })
  }, [ordered, t, periodReports, periods])

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
        <Txt as="p" className="rep-period-title">{periodLabel}</Txt>
        <Box className="rep-empty">
          <Txt as="p" className="rep-empty-text">{t('table.noMetrics')}</Txt>
        </Box>
      </>
    )
  }

  return (
    <>
      <RangePills range={config.range} onSetRange={onSetRange} />
      <Box className="rep-period-row">
        <Txt as="p" className="rep-period-title">{periodLabel}</Txt>
        <ExportButton onExport={exportGrid} />
      </Box>
      <Box className="rep-table-wrap">
        <table className="rep-table">
          <thead>
            <tr>
              <th className="rep-th-metric">{t('table.metric')}</th>
              {periodReports.map((p) => (
                <th key={`${p.year}-${p.month}`} className={`rep-th-period${p.isCurrent ? ' current' : ''}`}>
                  {p.label}
                </th>
              ))}
              {/* The column is a sum for flow metrics, an AVERAGE for the two
                  month-end snapshots and a re-computation for the percentages.
                  The manual says so in two places; the screen said only
                  "Summary", so a reader had no way to know the 12 beside
                  "active clients" was a mean and not a total. */}
              <th className="rep-th-summary">
                <Txt className="rep-th-summary-in">
                  {t('table.summary')}
                  <InfoPopover label={t('info', { label: t('table.summary') })} text={t('table.summaryDesc')} />
                </Txt>
              </th>
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
                    <Txt className="rep-td-metric-icon"><MetricIcon id={m.id} size={13} /></Txt>
                    <Txt className="rep-td-metric-name">{t(`metrics.${m.id}`)}</Txt>
                    {m.info && <InfoPopover label={t('info', { label: t(`metrics.${m.id}`) })} text={t(`metricsDesc.${m.id}`)} />}
                  </td>
                  {periodReports.map((p) => {
                    const v = p.data.metrics[m.id]
                    const empty = v === null || v === undefined || v === 0
                    return (
                      <td
                        key={`${p.year}-${p.month}`}
                        className={`rep-td-cell${p.isCurrent ? ' current' : ''}${empty ? '' : ' clickable'}`}
                      >
                        {/* A real button, not an onClick on the <td>. The cell
                            handler made drill-down mouse-only: nothing here was
                            focusable, so a keyboard user could read the table
                            and never open a single one of its figures. An empty
                            cell has nothing to open, so it stays inert text and
                            doesn't collect a tab stop. */}
                        {empty ? (
                          <Txt className="mono">{formatReportValue(m, v)}</Txt>
                        ) : (
                          <Btn
                            type="button"
                            className={`rep-td-btn mono${negCls(m, v)}`}
                            aria-label={t('table.drillAria', { metric: t(`metrics.${m.id}`), period: p.label })}
                            onClick={() => onDrill(m.id, p)}
                          >
                            {formatReportValue(m, v)}
                          </Btn>
                        )}
                      </td>
                    )
                  })}
                  <td className="rep-td-summary">
                    <Txt className={`mono${negCls(m, summary)}`}>{formatReportValue(m, summary)}</Txt>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Box>
    </>
  )
}

function RangePills({ range, onSetRange }) {
  const { t } = useT('reports')
  return (
    <Box className="rep-range-row">
      <Txt className="rep-range-label">{t('table.monthsBack')}</Txt>
      <Box className="rep-range-group">
        {[3, 6, 12].map((n) => (
          <Btn
            key={n}
            type="button"
            className={`rep-range-pill${range === n ? ' on' : ''}`}
            onClick={() => onSetRange(n)}
          >
            {n}
          </Btn>
        ))}
      </Box>
    </Box>
  )
}

/* ── CUSTOMIZE PANEL ─────────────────────────────────────────────
   Inline panel under the controls. Toggle each metric's visibility +
   drag the grip to reorder. Reset wipes back to factory defaults. */
function CustomizePanel({ config, onToggle, onReorder, onReset, onClose }) {
  const { t } = useT('reports')
  const items = useMemo(() => getAllOrderedMetrics(config), [config])
  const visible = useMemo(() => new Set(config.visibleMetrics), [config.visibleMetrics])
  /* "Default" silently threw away a hand-built order and a set of choices
     that persist across devices, on one tap, with no undo anywhere in the
     screen. It asks first now — the app's shared ConfirmModal, not a bespoke
     one. Not marked danger: nothing is deleted, the metrics all come back. */
  const [confirmReset, setConfirmReset] = useState(false)
  const [draggingId, setDraggingId] = useState(null)
  const [overId, setOverId] = useState(null)

  const handleDragStart = (e, id) => {
    /* A press that started on one of the row's own buttons is aimed at that
       button, not at the row — without this, reaching for ↑ / ↓ picks the
       row up instead. */
    if (e.target?.closest?.('button')) { e.preventDefault(); return }
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

  /* HTML5 drag-and-drop does not exist on touch, so on a phone the grip was
     decoration and the order could not be changed at all — while the hint
     said "drag to reorder". These two buttons are the reachable path, and
     they work with a keyboard too; the grip stays as the fast way on desktop.

     onReorder(from, to) removes `from` first and then inserts it BEFORE `to`,
     so stepping down has to target the row after the neighbour — and a null
     target means "put it last", which is exactly the second-to-last case. */
  const move = (id, index, dir) => {
    if (dir < 0) onReorder(id, items[index - 1]?.id)
    else onReorder(id, items[index + 2]?.id ?? null)
  }

  return (
    <Box className="rep-cust" role="region" aria-label={t('customize.regionAria')}>
      <Box className="rep-cust-head">
        <Txt className="rep-cust-title">{t('customize.title')}</Txt>
        <Btn type="button" className="rep-cust-reset" onClick={() => setConfirmReset(true)} title={t('customize.resetTitle')}>
          <RotateCcw size={12} strokeWidth={1.6} aria-hidden="true" /> {t('customize.reset')}
        </Btn>
        <Btn type="button" className="rep-cust-close" aria-label={t('customize.close')} onClick={onClose}>
          <X size={14} strokeWidth={1.6} aria-hidden="true" />
        </Btn>
      </Box>
      <Txt as="p" className="rep-cust-hint">{t('customize.hint')}</Txt>
      <Box className="rep-cust-list">
        {items.map((m, i) => {
          const on = visible.has(m.id)
          return (
            <Box
              key={m.id}
              className={`rep-cust-row${on ? ' on' : ''}${draggingId === m.id ? ' dragging' : ''}${overId === m.id ? ' over' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, m.id)}
              onDragOver={(e) => handleDragOver(e, m.id)}
              onDrop={(e) => handleDrop(e, m.id)}
              onDragEnd={handleDragEnd}
            >
              <Txt className="rep-cust-grip" aria-hidden="true">
                <GripVertical size={14} strokeWidth={1.5} />
              </Txt>
              <Box className="rep-cust-moves">
                <Btn
                  type="button"
                  className="rep-cust-move"
                  aria-label={t('customize.moveUp', { label: t(`metrics.${m.id}`) })}
                  disabled={i === 0}
                  onClick={() => move(m.id, i, -1)}
                >
                  <ChevronUp size={14} strokeWidth={1.8} aria-hidden="true" />
                </Btn>
                <Btn
                  type="button"
                  className="rep-cust-move"
                  aria-label={t('customize.moveDown', { label: t(`metrics.${m.id}`) })}
                  disabled={i === items.length - 1}
                  onClick={() => move(m.id, i, 1)}
                >
                  <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />
                </Btn>
              </Box>
              <Txt className="rep-cust-icon"><MetricIcon id={m.id} /></Txt>
              <Txt className="rep-cust-label">{t(`metrics.${m.id}`)}</Txt>
              <Btn
                type="button"
                className={`rep-cust-toggle${on ? ' on' : ''}`}
                aria-label={on ? t('customize.hide', { label: t(`metrics.${m.id}`) }) : t('customize.show', { label: t(`metrics.${m.id}`) })}
                onClick={() => onToggle(m.id)}
              >
                <Txt className="rep-cust-toggle-knob" />
              </Btn>
            </Box>
          )
        })}
      </Box>
      <ConfirmModal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title={t('customize.resetTitle')}
        message={t('customize.resetConfirm')}
        confirmLabel={t('customize.reset')}
        onConfirm={onReset}
      />
    </Box>
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

  /* The number comes from the ledger, the list from the rows — so once the
     30-day purge removes an old month's rows, a count of 47 can sit above 12
     listed records. Say so rather than letting the gap read as a bug or, at
     zero rows, as "nothing happened". Counts only; a percentage has no
     records behind it. */
  const counted = useMemo(() => {
    if (!drill || !metric || metric.format !== 'count') return null
    const v = computeReportForRange(drill.period.start, drill.period.end, data).metrics[drill.metricId]
    return typeof v === 'number' ? v : null
  }, [drill, metric, data])
  const missing = counted !== null ? counted - records.length : 0

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <Txt as="p" className="rep-drill-count">
        {t('drill.count', { count: counted ?? records.length })}
      </Txt>
      {missing > 0 && (
        <Txt as="p" className="rep-drill-purged">{t('drill.purged', { count: missing })}</Txt>
      )}
      {records.length === 0 && missing <= 0 ? (
        <Box className="rep-drill-empty">{t('drill.empty')}</Box>
      ) : (
        <Box className="rep-drill-list">
          {records.map((r, i) => (
            <Btn
              key={`${r.primary}-${i}`}
              type="button"
              className="rep-drill-row"
              onClick={() => onNavigate(r.navigateTo)}
            >
              <Txt className="rep-drill-row-icon"><DrillRowIcon name={r.icon} /></Txt>
              <Txt className="rep-drill-row-text">
                <Txt className="rep-drill-row-primary">{r.primary}</Txt>
                <Txt className="rep-drill-row-secondary">{r.secondary}</Txt>
              </Txt>
              <Txt className="rep-drill-row-chev"><ChevronLeft size={16} strokeWidth={1.5} aria-hidden="true" /></Txt>
            </Btn>
          ))}
        </Box>
      )}
    </Modal>
  )
}
