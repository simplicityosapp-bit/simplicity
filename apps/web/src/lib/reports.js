/* ════════════════════════════════════════════════════════════════
   REPORTS — period engine + metric registry + per-range aggregator.
   ════════════════════════════════════════════════════════════════
   Single source of truth for the dynamic reports screen. The screen
   passes real Supabase rows as a data bag; this lib is pure.

   13 metrics in 5 groups (matching the prototype). Two notable
   simplifications vs. mangata_v2.html:
   - We don't have a `closed_at` field on leads. "leadsClosed" therefore
     means: a lead whose status_meta is non-in_process AND whose
     last_status_changed_at falls in the range.
   - We don't have a client status log table. "activeClientsAtEnd"
     therefore assumes the current status_meta has held since created_at
     (good-enough heuristic until we ship a log).
   ════════════════════════════════════════════════════════════════ */

import i18n from '@simplicity/core/i18n'
import { isr, isConfirmedTx } from './finance'
import { isConvertedLead } from './leads'
import { monthNamesShort } from '@simplicity/core'

const live = (a) => (a || []).filter((r) => !r.deleted_at)

/* ── Period engine ─────────────────────────────────────────────── */

/* Last N months including current, oldest → newest. Pass `lng` (the active
   language) so month labels follow it — callers thread it through a useMemo
   dependency to recompute the pills/headers on a language switch. */
export function getPeriodsForMonths(count, now = new Date(), lng) {
  const n = Math.max(1, count | 0)
  const months = monthNamesShort(lng)
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({
      start: new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0),
      end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
      label: `${months[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`,
      year: d.getFullYear(),
      month: d.getMonth(),
      isCurrent: i === 0,
    })
  }
  return out
}

/* 12-month strip used by the list view's pills. */
export function getLast12Months(now = new Date(), lng) {
  return getPeriodsForMonths(12, now, lng)
}

/* ── Snapshot helpers ──────────────────────────────────────────── */

/* Active clients "as of" an end date — naive: current status_meta is
   assumed to have held since created_at. Good-enough until we ship a
   per-status log. */
function activeClientsAsOf(clients, end) {
  const t = end.getTime()
  return live(clients).filter((c) => {
    if ((c.status_meta || c.status || 'no_status') !== 'active') return false
    const created = c.created_at ? new Date(c.created_at).getTime() : 0
    if (created > t) return false
    return true
  }).length
}

/* Open tasks "as of" an end date — created by then, not completed by
   then, not deleted by then. */
function openTasksAsOf(tasks, end) {
  const t = end.getTime()
  let count = 0
  ;(tasks || []).forEach((task) => {
    const created = task.created_at ? new Date(task.created_at).getTime() : 0
    if (created > t) return
    if (task.deleted_at && new Date(task.deleted_at).getTime() <= t) return
    if (task.completed_at && new Date(task.completed_at).getTime() <= t) return
    if (!task.completed_at && task.status === 'done') return  /* defensive */
    count++
  })
  return count
}

/* ── Core per-range aggregator ─────────────────────────────────── */

export function computeReportForRange(start, end, data = {}) {
  const {
    leads = [],
    clients = [],
    sessions = [],
    transactions = [],
    tasks = [],
    groupMembers = [],
  } = data

  const startMs = start.getTime()
  const endMs = end.getTime()
  const sYMD = toISODate(start)
  const eYMD = toISODate(end)

  const inRangeTs = (iso) => {
    if (!iso) return false
    const t = new Date(iso).getTime()
    return t >= startMs && t <= endMs
  }
  const inRangeYMD = (ymd) => !!ymd && ymd >= sYMD && ymd <= eYMD

  /* ── Leads ── */
  const liveLeads = live(leads)
  const newLeads = liveLeads.filter((l) =>
    l.inquiry_date ? inRangeYMD(l.inquiry_date) : inRangeTs(l.created_at),
  )
  /* leadsClosed: any lead with a closed_at in range (D24 — closing
     covers converted + not_relevant + ghost). Field is maintained by
     the leads API reconcileClosedAt() shim. */
  const closedLeads = liveLeads.filter((l) => inRangeTs(l.closed_at))
  const convertedLeads = liveLeads.filter((l) => isConvertedLead(l) && inRangeTs(l.converted_at))
  const cohortConverted = newLeads.filter(isConvertedLead).length
  const conversionRate = newLeads.length > 0
    ? Math.round((cohortConverted / newLeads.length) * 100)
    : null

  /* ── Clients ── */
  const liveClients = live(clients)
  const newClients = liveClients.filter((c) => inRangeTs(c.created_at))
  const activeAtEnd = activeClientsAsOf(clients, end)

  /* Churn: left mid-process / total ended in range. */
  const liveMembers = live(groupMembers)
  let leftCount = 0
  let totalEnded = 0
  liveMembers.forEach((m) => {
    if (!m.left_at) return
    if (!inRangeTs(m.left_at)) return
    totalEnded++
    if (m.left_mid_process) leftCount++
  })
  liveClients.forEach((c) => {
    if ((c.status_meta || c.status) !== 'past') return
    if (!(c.sessions > 0)) return
    if (!inRangeTs(c.last_status_changed_at)) return
    totalEnded++
    if (c.left_mid_process) leftCount++
  })
  const leftMidProcessPct = totalEnded > 0 ? Math.round((leftCount / totalEnded) * 100) : null

  /* ── Sessions ── */
  const sessionsInRange = live(sessions).filter((s) => inRangeTs(s.date)).length

  /* ── Finance ── */
  const confirmed = (transactions || []).filter(
    (f) => !f.deleted_at && isConfirmedTx(f) && inRangeTs(f.date),
  )
  const income = confirmed
    .filter((f) => f.type === 'income')
    .reduce((s, f) => s + (f.amount || 0), 0)
  const expense = confirmed
    .filter((f) => f.type === 'expense')
    .reduce((s, f) => s + (f.amount || 0), 0)
  const net = income - expense

  /* ── Tasks ── */
  const liveTasks = live(tasks)
  const tasksCompleted = liveTasks.filter((t) => inRangeTs(t.completed_at)).length
  const openAtEnd = openTasksAsOf(tasks, end)

  return {
    period: { start, end },
    metrics: {
      newInquiries: newLeads.length,
      leadsClosed: closedLeads.length,
      leadsConverted: convertedLeads.length,
      conversionRate,
      newClients: newClients.length,
      activeClientsAtEnd: activeAtEnd,
      leftMidProcessPct,
      sessions: sessionsInRange,
      income,
      expense,
      net,
      tasksCompleted,
      openTasksAtEnd: openAtEnd,
    },
  }
}

/* ── Metric registry ───────────────────────────────────────────── */

/* Single source of truth. Each metric:
   - id: matches computeReportForRange().metrics
   - group: row-grouping (REPORT_GROUPS)
   - kind: 'flow' | 'snapshot' | 'cohortPct' — drives summary semantics.
   - format: 'count' | 'money' | 'pct'
   - info:  true when the metric has an explanatory description.
   Display strings (label/desc/group name) resolve via i18n at the call site
   (reports:metrics.<id> / reports:metricsDesc.<id> / reports:groups.<id>) so
   the registry stays language-agnostic and follows the active language. */
export const REPORT_METRICS = [
  /* Leads */
  { id: 'newInquiries',       group: 'leads',    kind: 'flow',      format: 'count' },
  { id: 'leadsClosed',        group: 'leads',    kind: 'flow',      format: 'count', info: true },
  { id: 'leadsConverted',     group: 'leads',    kind: 'flow',      format: 'count' },
  { id: 'conversionRate',     group: 'leads',    kind: 'cohortPct', format: 'pct' },
  /* Clients */
  { id: 'newClients',         group: 'clients',  kind: 'flow',      format: 'count' },
  { id: 'activeClientsAtEnd', group: 'clients',  kind: 'snapshot',  format: 'count' },
  { id: 'leftMidProcessPct',  group: 'clients',  kind: 'cohortPct', format: 'pct' },
  /* Sessions */
  { id: 'sessions',           group: 'sessions', kind: 'flow',      format: 'count' },
  /* Finance */
  { id: 'income',             group: 'finance',  kind: 'flow',      format: 'money' },
  { id: 'expense',            group: 'finance',  kind: 'flow',      format: 'money' },
  { id: 'net',                group: 'finance',  kind: 'flow',      format: 'money' },
  /* Tasks */
  { id: 'tasksCompleted',     group: 'tasks',    kind: 'flow',      format: 'count' },
  { id: 'openTasksAtEnd',     group: 'tasks',    kind: 'snapshot',  format: 'count' },
]

export const REPORT_GROUPS = [
  { id: 'leads' },
  { id: 'clients' },
  { id: 'sessions' },
  { id: 'finance' },
  { id: 'tasks' },
]

/* ── Formatting ────────────────────────────────────────────────── */

export function formatReportValue(metric, val) {
  if (val === null || val === undefined) return '—'
  if (metric.format === 'money') return isr(val)
  if (metric.format === 'pct') return `${val}%`
  return String(val)
}

/* ── Summary cell (for the table view) ─────────────────────────── */

/* Sum for flow, average for snapshot, recompute over the whole range
   for cohortPct (since percentages don't sum). */
export function computeReportSummary(metric, periodReports) {
  if (!periodReports.length) return null
  if (metric.kind === 'flow') {
    let sum = 0
    let any = false
    periodReports.forEach((p) => {
      const v = p.data.metrics[metric.id]
      if (v != null) { sum += v; any = true }
    })
    return any ? sum : null
  }
  if (metric.kind === 'snapshot') {
    let sum = 0
    let n = 0
    periodReports.forEach((p) => {
      const v = p.data.metrics[metric.id]
      if (v != null) { sum += v; n++ }
    })
    return n ? Math.round(sum / n) : null
  }
  /* cohortPct — recompute across the full range, using the raw counts
     from each period's underlying records. We approximate by averaging
     the per-period rate weighted by the period's cohort size. */
  if (metric.id === 'conversionRate') {
    let cohort = 0
    let converted = 0
    periodReports.forEach((p) => {
      const m = p.data.metrics
      if (m.newInquiries == null) return
      cohort += m.newInquiries
      if (m.conversionRate != null) {
        converted += Math.round((m.conversionRate / 100) * m.newInquiries)
      }
    })
    return cohort > 0 ? Math.round((converted / cohort) * 100) : null
  }
  if (metric.id === 'leftMidProcessPct') {
    /* No raw totals exposed → average non-null values. */
    let sum = 0
    let n = 0
    periodReports.forEach((p) => {
      const v = p.data.metrics[metric.id]
      if (v != null) { sum += v; n++ }
    })
    return n ? Math.round(sum / n) : null
  }
  return null
}

/* ── Config helpers ────────────────────────────────────────────── */

/* Resolve user's metricOrder + visibleMetrics into the ordered list of
   metric objects to display. Falls back to registry order. */
export function getOrderedVisibleMetrics(cfg) {
  const visible = new Set(cfg?.visibleMetrics || REPORT_METRICS.map((m) => m.id))
  const order = (cfg?.metricOrder && cfg.metricOrder.length)
    ? cfg.metricOrder
    : REPORT_METRICS.map((m) => m.id)
  const byId = new Map(REPORT_METRICS.map((m) => [m.id, m]))
  return order
    .filter((id) => visible.has(id) && byId.has(id))
    .map((id) => byId.get(id))
}

/* All metrics in the user's order (visible + hidden) — used by the
   customize panel. */
export function getAllOrderedMetrics(cfg) {
  const order = (cfg?.metricOrder && cfg.metricOrder.length)
    ? cfg.metricOrder
    : REPORT_METRICS.map((m) => m.id)
  const byId = new Map(REPORT_METRICS.map((m) => [m.id, m]))
  /* Auto-extend: any registry id missing from order goes at the end. */
  const ids = [...order]
  REPORT_METRICS.forEach((m) => { if (!ids.includes(m.id)) ids.push(m.id) })
  return ids.filter((id) => byId.has(id)).map((id) => byId.get(id))
}

/* ── Drill-down records ─────────────────────────────────────────
   For a (metricId, period) pair, return the underlying entities so
   the modal can list them and link out. Each record:
   { icon, primary, secondary, navigateTo }                           */
export function getDrillRecords(metricId, start, end, data = {}) {
  const startMs = start.getTime()
  const endMs = end.getTime()
  const sYMD = toISODate(start)
  const eYMD = toISODate(end)
  const inRangeTs = (iso) => {
    if (!iso) return false
    const t = new Date(iso).getTime()
    return t >= startMs && t <= endMs
  }
  const inRangeYMD = (ymd) => !!ymd && ymd >= sYMD && ymd <= eYMD
  const {
    leads = [], clients = [], sessions = [], transactions = [],
    tasks = [], groupMembers = [], groups = [],
  } = data

  const out = []
  const liveLeads = live(leads)
  const liveClients = live(clients)
  const liveSessions = live(sessions)
  const liveTasks = live(tasks)

  const leadRow = (l, secondary) => ({
    icon: 'leaf',
    primary: l.name || i18n.t('reports:drill.noName'),
    secondary,
    navigateTo: '/leads',
  })
  const clientRow = (c, secondary, icon = 'user') => ({
    icon,
    primary: c.name || i18n.t('reports:drill.noName'),
    secondary,
    navigateTo: '/clients',
  })

  switch (metricId) {
    case 'newInquiries': {
      liveLeads.forEach((l) => {
        const ok = l.inquiry_date ? inRangeYMD(l.inquiry_date) : inRangeTs(l.created_at)
        if (ok) out.push(leadRow(l, fmtDay(l.inquiry_date || l.created_at)))
      })
      break
    }
    case 'leadsClosed': {
      liveLeads.forEach((l) => {
        if (!inRangeTs(l.closed_at)) return
        const meta = l.status_meta || 'in_process'
        const label = meta === 'converted' ? i18n.t('reports:drill.converted')
          : meta === 'not_relevant' ? i18n.t('reports:drill.notRelevant')
            : meta === 'ghost' ? i18n.t('reports:drill.ghost') : i18n.t('reports:drill.closed')
        out.push({ ...leadRow(l, `${label} • ${fmtDay(l.closed_at)}`), icon: 'x' })
      })
      break
    }
    case 'leadsConverted': {
      liveLeads.forEach((l) => {
        if (!isConvertedLead(l) || !inRangeTs(l.converted_at)) return
        out.push({ ...leadRow(l, `${i18n.t('reports:drill.converted')} • ${fmtDay(l.converted_at)}`), icon: 'arrow' })
      })
      break
    }
    case 'conversionRate': {
      /* Cohort = leads with inquiry in range; show all + mark converted. */
      liveLeads.forEach((l) => {
        const inCohort = l.inquiry_date ? inRangeYMD(l.inquiry_date) : inRangeTs(l.created_at)
        if (!inCohort) return
        const converted = isConvertedLead(l)
        out.push({
          ...leadRow(l, converted ? `${i18n.t('reports:drill.converted')} • ${fmtDay(l.converted_at)}` : `${i18n.t('reports:drill.inquiry')} • ${fmtDay(l.inquiry_date || l.created_at)}`),
          icon: converted ? 'arrow' : 'leaf',
          primary: (converted ? '✓ ' : '') + (l.name || i18n.t('reports:drill.noName')),
        })
      })
      break
    }
    case 'newClients': {
      liveClients.forEach((c) => {
        if (!inRangeTs(c.created_at)) return
        out.push(clientRow(c, fmtDay(c.created_at), 'users'))
      })
      break
    }
    case 'activeClientsAtEnd': {
      const t = end.getTime()
      liveClients.forEach((c) => {
        if ((c.status_meta || c.status || 'no_status') !== 'active') return
        const created = c.created_at ? new Date(c.created_at).getTime() : 0
        if (created > t) return
        out.push(clientRow(c, i18n.t('reports:drill.activeAtEnd', { date: fmtDay(end) }), 'check'))
      })
      break
    }
    case 'leftMidProcessPct': {
      live(groupMembers).forEach((m) => {
        if (!m.left_mid_process || !m.left_at) return
        if (!inRangeTs(m.left_at)) return
        const cli = liveClients.find((x) => x.id === m.client_id)
        const grp = groups.find((x) => x.id === m.group_id)
        const name = (cli?.name || i18n.t('reports:drill.unknownClient')) + (grp ? ` · ${grp.name}` : '')
        out.push({
          icon: 'x',
          primary: name,
          secondary: i18n.t('reports:drill.leftGroup', { date: fmtDay(m.left_at) }),
          navigateTo: '/clients',
        })
      })
      liveClients.forEach((c) => {
        if ((c.status_meta || c.status) !== 'past') return
        if (!c.left_mid_process || !(c.sessions > 0)) return
        if (!inRangeTs(c.last_status_changed_at)) return
        out.push(clientRow(c, i18n.t('reports:drill.personalSeriesEnded', { date: fmtDay(c.last_status_changed_at) }), 'x'))
      })
      break
    }
    case 'sessions': {
      liveSessions.forEach((s) => {
        if (!inRangeTs(s.date)) return
        let label = i18n.t('reports:drill.session')
        if (s.client_id) {
          const c = liveClients.find((x) => x.id === s.client_id)
          if (c) label = c.name
        } else if (s.group_id) {
          const g = groups.find((x) => x.id === s.group_id)
          if (g) label = i18n.t('reports:drill.groupLabel', { name: g.name })
        }
        out.push({
          icon: 'calendar',
          primary: label + (s.num ? ` · ${i18n.t('reports:drill.sessionNum', { num: s.num })}` : ''),
          secondary: fmtDay(s.date),
          navigateTo: '/calendar',
        })
      })
      break
    }
    case 'income':
    case 'expense':
    case 'net': {
      const types = metricId === 'income' ? ['income']
        : metricId === 'expense' ? ['expense']
          : ['income', 'expense']
      ;(transactions || []).forEach((f) => {
        if (f.deleted_at) return
        if (!isConfirmedTx(f)) return
        if (!types.includes(f.type)) return
        if (!inRangeTs(f.date)) return
        const sign = f.type === 'income' ? '+' : '−'
        out.push({
          icon: f.type === 'income' ? 'arrowDown' : 'arrowUp',
          primary: f.desc || i18n.t('reports:drill.noDesc'),
          secondary: `${sign}${isr(f.amount)} • ${fmtDay(f.date)}`,
          navigateTo: '/finance',
        })
      })
      break
    }
    case 'tasksCompleted': {
      liveTasks.forEach((t) => {
        if (!inRangeTs(t.completed_at)) return
        out.push({
          icon: 'check',
          primary: t.title || i18n.t('reports:drill.noTitle'),
          secondary: i18n.t('reports:drill.completedOn', { date: fmtDay(t.completed_at) }),
          navigateTo: '/tasks',
        })
      })
      break
    }
    case 'openTasksAtEnd': {
      const t = end.getTime()
      ;(tasks || []).forEach((task) => {
        const created = task.created_at ? new Date(task.created_at).getTime() : 0
        if (created > t) return
        if (task.deleted_at && new Date(task.deleted_at).getTime() <= t) return
        if (task.completed_at && new Date(task.completed_at).getTime() <= t) return
        if (!task.completed_at && task.status === 'done') return
        out.push({
          icon: 'circleAlert',
          primary: task.title || i18n.t('reports:drill.noTitle'),
          secondary: `${i18n.t('reports:drill.openAtEnd', { date: fmtDay(end) })}${task.priority === 'high' ? ` • ${i18n.t('reports:drill.urgent')}` : ''}`,
          navigateTo: '/tasks',
        })
      })
      break
    }
    default:
      break
  }
  /* Sort newest-first by the DD/MM/YY date fmtDay embeds in `secondary`,
     compared as a real date (lexical compare ordered by day-of-month, not
     chronologically). Same-date rows keep a stable secondary tie-break. */
  out.sort((a, b) => {
    const ka = drillSortKey(a.secondary)
    const kb = drillSortKey(b.secondary)
    if (kb !== ka) return kb - ka
    return String(b.secondary).localeCompare(String(a.secondary))
  })
  return out
}

/* Extract fmtDay's DD/MM/YY token from a drill record's `secondary` and turn
   it into a sortable YYYYMMDD number; 0 when there's no date (sinks to the end). */
function drillSortKey(secondary) {
  const m = String(secondary).match(/(\d{2})\/(\d{2})\/(\d{2})/)
  if (!m) return 0
  const [, dd, mm, yy] = m
  return Number(`20${yy}${mm}${dd}`)
}

/* ── Date helpers (local) ──────────────────────────────────────── */

function toISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fmtDay(iso) {
  if (!iso) return ''
  const d = iso instanceof Date ? iso : new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}
