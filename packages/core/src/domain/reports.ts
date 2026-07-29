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

import i18n from '../i18n'
import { isr, isConfirmedTx, type Tx } from './finance'
import { monthNamesShort } from './calendar'
import { isConvertedLead } from './leads'

interface RLead {
  deleted_at?: string | null
  inquiry_date?: string | null
  created_at?: string | null
  closed_at?: string | null
  converted_at?: string | null
  status_meta?: string
  name?: string
}
interface RClient {
  id?: string
  deleted_at?: string | null
  status_meta?: string
  status?: string
  created_at?: string | null
  sessions?: number | null
  last_status_changed_at?: string | null
  left_mid_process?: boolean
  name?: string
}
interface RSession {
  deleted_at?: string | null
  date?: string | number | Date | null
  client_id?: string
  group_id?: string
  num?: number
}
interface RTask {
  deleted_at?: string | null
  created_at?: string | null
  completed_at?: string | null
  status?: string
  title?: string
  priority?: string
}
interface RMember {
  deleted_at?: string | null
  left_at?: string | null
  left_mid_process?: boolean
  client_id?: string
  group_id?: string
}
interface RGroup { id?: string; name?: string }

/* One row of public.report_tallies — a per-month event counter maintained by
   database triggers (migration 0100). `period` is the first day of the month
   in Asia/Jerusalem, as 'YYYY-MM-DD'. */
export interface RTally {
  period?: string | null
  metric?: string | null
  count?: number | null
}

export interface ReportData {
  leads?: RLead[]
  clients?: RClient[]
  sessions?: RSession[]
  transactions?: Tx[]
  tasks?: RTask[]
  groupMembers?: RMember[]
  groups?: RGroup[]
  /* When present, the flow metrics are read from here instead of counted off
     the rows — see the note above computeReportForRange. Omit it and the
     function behaves exactly as it always did, which is what keeps it usable
     as a pure function in tests with synthetic rows. */
  tallies?: RTally[]
}

export interface ReportPeriod {
  start: Date
  end: Date
  label: string
  year: number
  month: number
  isCurrent: boolean
}

export interface ReportResult {
  period: { start: Date; end: Date }
  metrics: Record<string, number | null>
}

export interface ReportMetric {
  id: string
  group: string
  kind: string
  format: string
  info?: boolean
}

export interface DrillRecord {
  icon: string
  primary: string
  secondary: string
  navigateTo: string
}

/* ── What a deleted row means to a report ──────────────────────────
   A period is a record of what happened in it. Deleting a row later is
   the user tidying their working screens; it is not a claim that the
   event never occurred, and a finished month must not quietly shrink
   because of it (feedback acbbeaa5, extended to every metric by the
   owner 2026-07-28).

   So FLOW metrics — things that happened on a date: inquiries, closes,
   conversions, new clients, sessions, completed tasks — count from the
   raw list and ignore deleted_at entirely. `all()` names that intent, so
   a bare `(rows || [])` never reads like an oversight.

   SNAPSHOT metrics are different, and the difference is not a product
   choice but arithmetic: "active clients at the end of June" is a
   question about June. A client deleted in June was already gone by the
   30th; one deleted in July was still there. Those use `existedAsOf`,
   the rule openTasksAsOf has always applied.

   MONEY is the exception, and it is the one to remember when this file
   is next tidied: income/expense/net still drop deleted rows. The rule
   above rests on deletion meaning "I'm done looking at this", which is
   false for a transaction — that gets deleted because it was WRONG, and
   an uncorrectable wrong number is worse than a forgotten right one.
   Owner's call, 2026-07-29; see the Finance block below.

   The trash never purges — it only offers restore — so these rows stay
   available to count indefinitely. */
const all = <T,>(a: T[] | null | undefined): T[] => a || []

const existedAsOf = (row: { deleted_at?: string | null }, end: Date): boolean =>
  !row.deleted_at || new Date(row.deleted_at).getTime() > end.getTime()

/* ── Period engine ─────────────────────────────────────────────── */

/* Last N months including current, oldest → newest. Pass `lng` (the active
   language) so month labels follow it — callers thread it through a useMemo
   dependency to recompute the pills/headers on a language switch. */
export function getPeriodsForMonths(count: number, now: Date = new Date(), lng?: string): ReportPeriod[] {
  const n = Math.max(1, count | 0)
  const months = monthNamesShort(lng)
  const out: ReportPeriod[] = []
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
export function getLast12Months(now: Date = new Date(), lng?: string): ReportPeriod[] {
  return getPeriodsForMonths(12, now, lng)
}

/* ── Snapshot helpers ──────────────────────────────────────────── */

/* Active clients "as of" an end date — naive: current status_meta is
   assumed to have held since created_at. Good-enough until we ship a
   per-status log.

   Deleted clients count only while they still existed: one deleted in
   July was genuinely active at the end of June. Same rule as
   openTasksAsOf below. */
function activeClientsAsOf(clients: RClient[] | undefined, end: Date): number {
  const t = end.getTime()
  return all(clients).filter((c) => {
    if (!existedAsOf(c, end)) return false
    if ((c.status_meta || c.status || 'no_status') !== 'active') return false
    const created = c.created_at ? new Date(c.created_at).getTime() : 0
    if (created > t) return false
    return true
  }).length
}

/* Open tasks "as of" an end date — created by then, not completed by
   then, not deleted by then. The original "as of" metric; existedAsOf was
   extracted from this one. */
function openTasksAsOf(tasks: RTask[] | undefined, end: Date): number {
  const t = end.getTime()
  let count = 0
  all(tasks).forEach((task) => {
    const created = task.created_at ? new Date(task.created_at).getTime() : 0
    if (created > t) return
    if (!existedAsOf(task, end)) return
    if (task.completed_at && new Date(task.completed_at).getTime() <= t) return
    if (!task.completed_at && task.status === 'done') return  /* defensive */
    count++
  })
  return count
}

/* Sum the month buckets that fall inside [start, end] for one metric.
   Report ranges are always whole months (getPeriodsForMonths), so a bucket is
   either wholly in or wholly out and summing is exact — for a single month in
   the list view and for a 3/6/12-month span in the table alike. */
function tallyIn(tallies: RTally[], metric: string, start: Date, end: Date): number {
  const s = toISODate(start)
  const e = toISODate(end)
  let n = 0
  tallies.forEach((t) => {
    if (t.metric !== metric) return
    if (!t.period || t.period < s || t.period > e) return
    n += t.count || 0
  })
  return n
}

/* Snapshots are a VALUE AT a date, not a running total, so they are looked up
   rather than summed — and the date that matters is the END of the range. For
   a single month that is its own bucket; for a 3/6/12-month span it is the
   last month in it, which is exactly what "active at the end" means.

   Only CLOSED months are stored (migration 0101), so the current month misses
   and falls back to counting live rows — correct, because it is still moving.
   Returns null when there is nothing to use. */
function snapshotAt(tallies: RTally[], metric: string, end: Date): number | null {
  const period = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-01`
  const hit = tallies.find((t) => t.metric === metric && t.period === period)
  return hit && typeof hit.count === 'number' ? hit.count : null
}

/* ── Core per-range aggregator ─────────────────────────────────── */

/* FLOW METRICS COME FROM THE LEDGER WHEN IT IS SUPPLIED.
   Counting them off the rows makes a number only as durable as its rows, so
   deleting a finished task shrank a closed month (acbbeaa5) and the 30-day
   purge would rewrite history wholesale. report_tallies (migration 0100)
   records each event as it happens; passing it in makes the count independent
   of whether the row still exists.

   Without `tallies` this falls back to counting rows, unchanged. That keeps
   the function pure and testable with synthetic data, and it is why the two
   paths must stay numerically identical — the suite pins them against each
   other.

   Money and the two "as of" snapshots are NOT in the ledger and always read
   rows: money deliberately excludes deleted rows, and "how many, as of this
   date" cannot be derived from an event count. */
export function computeReportForRange(start: Date, end: Date, data: ReportData = {}): ReportResult {
  const {
    leads = [],
    clients = [],
    sessions = [],
    transactions = [],
    tasks = [],
    groupMembers = [],
    tallies,
  } = data
  const led = tallies ? (m: string) => tallyIn(tallies, m, start, end) : null

  const startMs = start.getTime()
  const endMs = end.getTime()
  const sYMD = toISODate(start)
  const eYMD = toISODate(end)

  const inRangeTs = (iso?: string | number | Date | null) => {
    if (!iso) return false
    const t = new Date(iso).getTime()
    return t >= startMs && t <= endMs
  }
  const inRangeYMD = (ymd?: string | null) => !!ymd && ymd >= sYMD && ymd <= eYMD

  /* ── Leads ── */
  const allLeads = all(leads)
  const newLeads = allLeads.filter((l) =>
    l.inquiry_date ? inRangeYMD(l.inquiry_date) : inRangeTs(l.created_at),
  )
  /* leadsClosed: any lead with a closed_at in range (D24 — closing
     covers converted + not_relevant + ghost). Field is maintained by
     the leads API reconcileClosedAt() shim. */
  const closedLeads = allLeads.filter((l) => inRangeTs(l.closed_at))
  const convertedLeads = allLeads.filter((l) => isConvertedLead(l) && inRangeTs(l.converted_at))

  const newInquiries = led ? led('new_inquiries') : newLeads.length
  const leadsClosed = led ? led('leads_closed') : closedLeads.length
  const leadsConverted = led ? led('leads_converted') : convertedLeads.length

  /* Cohort ratio: of the leads that enquired in this range, how many ever
     converted — which is why the ledger files cohort_converted under the
     INQUIRY month even when the conversion came later. */
  const cohortConverted = led ? led('cohort_converted') : newLeads.filter(isConvertedLead).length
  const conversionRate = newInquiries > 0
    ? Math.round((cohortConverted / newInquiries) * 100)
    : null

  /* ── Clients ── */
  const allClients = all(clients)
  const newClientRows = allClients.filter((c) => inRangeTs(c.created_at))
  const newClients = led ? led('new_clients') : newClientRows.length
  /* Frozen value first, live count as the fallback — the two agree while the
     rows are still there, and only the frozen one survives the purge. */
  const activeAtEnd = (tallies && snapshotAt(tallies, 'active_clients_at_end', end))
    ?? activeClientsAsOf(clients, end)

  /* Churn: left mid-process / total ended in range. Both halves are flow —
     an ending that happened stays in the denominator, so deleting the
     client afterwards can't move the percentage. */
  let leftCount = 0
  let totalEnded = 0
  all(groupMembers).forEach((m) => {
    if (!m.left_at) return
    if (!inRangeTs(m.left_at)) return
    totalEnded++
    if (m.left_mid_process) leftCount++
  })
  /* ⚠ This branch never fires: clients has no last_status_changed_at column
     (only leads does), so inRangeTs() always sees undefined. That means a
     PERSONAL client who ended mid-process has never reached this metric —
     only group members do. Found while building the ledger, which mirrors
     the behaviour rather than the intent so the two agree; fixing it moves a
     live business figure and is the owner's call. */
  allClients.forEach((c) => {
    if ((c.status_meta || c.status) !== 'past') return
    if (!((c.sessions || 0) > 0)) return
    if (!inRangeTs(c.last_status_changed_at)) return
    totalEnded++
    if (c.left_mid_process) leftCount++
  })
  const endedTotal = led ? led('ended_total') : totalEnded
  const endedLeftMid = led ? led('ended_left_mid') : leftCount
  const leftMidProcessPct = endedTotal > 0 ? Math.round((endedLeftMid / endedTotal) * 100) : null

  /* ── Sessions ── */
  const sessionsInRange = led
    ? led('sessions_held')
    : all(sessions).filter((s) => inRangeTs(s.date)).length

  /* ── Finance ── */
  /* THE EXCEPTION to the rule above: money still drops deleted rows.

     Everywhere else, deleting is housekeeping — the user tidying a screen
     they have finished with. Nobody deletes a transaction for tidiness;
     they delete it because it was wrong (a typo, a duplicate, a charge
     that never landed). Keeping it would leave an income figure the user
     can SEE is wrong with no way to correct it, since the trash only
     offers restore.

     So `!f.deleted_at` stays, alongside isConfirmedTx — a pending row was
     never money either. Owner's call, 2026-07-29. */
  const confirmed = all(transactions).filter(
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
  /* Completing a task is an event that happened; deleting the task afterwards
     does not un-happen it (acbbeaa5). The ledger makes that permanent — the
     row-based fallback below reads the RAW list for the same reason, and the
     two must agree. */
  const tasksCompleted = led
    ? led('tasks_completed')
    : all(tasks).filter((t) => inRangeTs(t.completed_at)).length
  const openAtEnd = (tallies && snapshotAt(tallies, 'open_tasks_at_end', end))
    ?? openTasksAsOf(tasks, end)

  return {
    period: { start, end },
    metrics: {
      newInquiries,
      leadsClosed,
      leadsConverted,
      conversionRate,
      newClients,
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
export const REPORT_METRICS: ReportMetric[] = [
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

export function formatReportValue(metric: ReportMetric, val: number | null | undefined): string {
  if (val === null || val === undefined) return '—'
  if (metric.format === 'money') return isr(val)
  if (metric.format === 'pct') return `${val}%`
  return String(val)
}

/* ── Summary cell (for the table view) ─────────────────────────── */

interface PeriodReport { data: ReportResult }

/* Sum for flow, average for snapshot, recompute over the whole range
   for cohortPct (since percentages don't sum). */
export function computeReportSummary(metric: ReportMetric, periodReports: PeriodReport[]): number | null {
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

interface ReportConfig { visibleMetrics?: string[]; metricOrder?: string[] }

/* Resolve user's metricOrder + visibleMetrics into the ordered list of
   metric objects to display. Falls back to registry order. */
export function getOrderedVisibleMetrics(cfg?: ReportConfig | null): ReportMetric[] {
  const visible = new Set(cfg?.visibleMetrics || REPORT_METRICS.map((m) => m.id))
  const order = (cfg?.metricOrder && cfg.metricOrder.length)
    ? cfg.metricOrder
    : REPORT_METRICS.map((m) => m.id)
  const byId = new Map(REPORT_METRICS.map((m) => [m.id, m]))
  return order
    .filter((id) => visible.has(id) && byId.has(id))
    .map((id) => byId.get(id)!)
}

/* All metrics in the user's order (visible + hidden) — used by the
   customize panel. */
export function getAllOrderedMetrics(cfg?: ReportConfig | null): ReportMetric[] {
  const order = (cfg?.metricOrder && cfg.metricOrder.length)
    ? cfg.metricOrder
    : REPORT_METRICS.map((m) => m.id)
  const byId = new Map(REPORT_METRICS.map((m) => [m.id, m]))
  /* Auto-extend: any registry id missing from order goes at the end. */
  const ids = [...order]
  REPORT_METRICS.forEach((m) => { if (!ids.includes(m.id)) ids.push(m.id) })
  return ids.filter((id) => byId.has(id)).map((id) => byId.get(id)!)
}

/* ── Drill-down records ─────────────────────────────────────────
   For a (metricId, period) pair, return the underlying entities so
   the modal can list them and link out. Each record:
   { icon, primary, secondary, navigateTo }                           */
export function getDrillRecords(metricId: string, start: Date, end: Date, data: ReportData = {}): DrillRecord[] {
  const startMs = start.getTime()
  const endMs = end.getTime()
  const sYMD = toISODate(start)
  const eYMD = toISODate(end)
  const inRangeTs = (iso?: string | number | Date | null) => {
    if (!iso) return false
    const t = new Date(iso).getTime()
    return t >= startMs && t <= endMs
  }
  const inRangeYMD = (ymd?: string | null) => !!ymd && ymd >= sYMD && ymd <= eYMD
  const {
    leads = [], clients = [], sessions = [], transactions = [],
    tasks = [], groupMembers = [], groups = [],
  } = data

  const out: DrillRecord[] = []
  /* Raw, to match the metrics — a drill list that omitted what the number
     counted would be the same bug one layer down. */
  const allLeads = all(leads)
  const allClients = all(clients)
  const allSessions = all(sessions)

  /* A drilled row whose record was deleted says where it went and links to
     the trash: sending it to /leads or /clients/:id would open a screen it
     is no longer on. The marker is a place, not a verb, so it agrees with
     every noun — Hebrew "נמחק/נמחקה" would have to know the entity's
     gender, and gets it wrong for half of them. */
  const trashed = <T extends { deleted_at?: string | null }>(rec: DrillRecord, row: T): DrillRecord =>
    row.deleted_at
      ? { ...rec, secondary: `${rec.secondary} • ${i18n.t('reports:drill.deleted')}`, navigateTo: '/trash' }
      : rec

  const leadRow = (l: RLead, secondary: string): DrillRecord => trashed({
    icon: 'leaf',
    primary: l.name || i18n.t('reports:drill.noName'),
    secondary,
    navigateTo: '/leads',
  }, l)
  const clientRow = (c: RClient, secondary: string, icon = 'user'): DrillRecord => trashed({
    icon,
    primary: c.name || i18n.t('reports:drill.noName'),
    secondary,
    // Deep-link to the client's own drawer (/clients/:id) instead of the bare
    // list, so drilling a report row opens that specific record.
    navigateTo: c.id ? `/clients/${c.id}` : '/clients',
  }, c)

  switch (metricId) {
    case 'newInquiries': {
      allLeads.forEach((l) => {
        const ok = l.inquiry_date ? inRangeYMD(l.inquiry_date) : inRangeTs(l.created_at)
        if (ok) out.push(leadRow(l, fmtDay(l.inquiry_date || l.created_at)))
      })
      break
    }
    case 'leadsClosed': {
      allLeads.forEach((l) => {
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
      allLeads.forEach((l) => {
        if (!isConvertedLead(l) || !inRangeTs(l.converted_at)) return
        out.push({ ...leadRow(l, `${i18n.t('reports:drill.converted')} • ${fmtDay(l.converted_at)}`), icon: 'arrow' })
      })
      break
    }
    case 'conversionRate': {
      /* Cohort = leads with inquiry in range; show all + mark converted. */
      allLeads.forEach((l) => {
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
      allClients.forEach((c) => {
        if (!inRangeTs(c.created_at)) return
        out.push(clientRow(c, fmtDay(c.created_at), 'users'))
      })
      break
    }
    case 'activeClientsAtEnd': {
      /* Snapshot, so the "as of" rule applies here exactly as it does in
         activeClientsAsOf — a client deleted DURING the period was not
         active at its end and must not be listed. */
      const t = end.getTime()
      allClients.forEach((c) => {
        if (!existedAsOf(c, end)) return
        if ((c.status_meta || c.status || 'no_status') !== 'active') return
        const created = c.created_at ? new Date(c.created_at).getTime() : 0
        if (created > t) return
        out.push(clientRow(c, i18n.t('reports:drill.activeAtEnd', { date: fmtDay(end) }), 'check'))
      })
      break
    }
    case 'leftMidProcessPct': {
      all(groupMembers).forEach((m) => {
        if (!m.left_mid_process || !m.left_at) return
        if (!inRangeTs(m.left_at)) return
        const cli = allClients.find((x) => x.id === m.client_id)
        const grp = groups.find((x) => x.id === m.group_id)
        const name = (cli?.name || i18n.t('reports:drill.unknownClient')) + (grp ? ` · ${grp.name}` : '')
        /* Marked on the CLIENT, not the membership row: the link goes to the
           client, so that is the record the user would fail to find. */
        out.push(trashed({
          icon: 'x',
          primary: name,
          secondary: i18n.t('reports:drill.leftGroup', { date: fmtDay(m.left_at) }),
          navigateTo: cli?.id ? `/clients/${cli.id}` : '/clients',
        }, cli || {}))
      })
      allClients.forEach((c) => {
        if ((c.status_meta || c.status) !== 'past') return
        if (!c.left_mid_process || !((c.sessions || 0) > 0)) return
        if (!inRangeTs(c.last_status_changed_at)) return
        out.push(clientRow(c, i18n.t('reports:drill.personalSeriesEnded', { date: fmtDay(c.last_status_changed_at) }), 'x'))
      })
      break
    }
    case 'sessions': {
      allSessions.forEach((s) => {
        if (!inRangeTs(s.date)) return
        let label = i18n.t('reports:drill.session')
        if (s.client_id) {
          const c = allClients.find((x) => x.id === s.client_id)
          if (c) label = c.name || label
        } else if (s.group_id) {
          const g = groups.find((x) => x.id === s.group_id)
          if (g) label = i18n.t('reports:drill.groupLabel', { name: g.name })
        }
        out.push(trashed({
          icon: 'calendar',
          primary: label + (s.num ? ` · ${i18n.t('reports:drill.sessionNum', { num: s.num })}` : ''),
          secondary: fmtDay(s.date),
          navigateTo: '/calendar',
        }, s))
      })
      break
    }
    case 'income':
    case 'expense':
    case 'net': {
      const types = metricId === 'income' ? ['income']
        : metricId === 'expense' ? ['expense']
          : ['income', 'expense']
      /* Money is the one exception — deleted transactions are excluded from
         the figure, so they must be absent from the list too, and no row
         here can ever need the trashed() marker. See computeReportForRange. */
      all(transactions).forEach((f) => {
        if (f.deleted_at) return
        if (!isConfirmedTx(f)) return
        if (!f.type || !types.includes(f.type)) return
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
      /* Raw list, to match the metric — see computeReportForRange. A row for a
         deleted task says so and points at the trash: sending it to /tasks
         would open a screen the task is no longer on. */
      all(tasks).forEach((t) => {
        if (!inRangeTs(t.completed_at)) return
        out.push(trashed({
          icon: 'check',
          primary: t.title || i18n.t('reports:drill.noTitle'),
          secondary: i18n.t('reports:drill.completedOn', { date: fmtDay(t.completed_at) }),
          navigateTo: '/tasks',
        }, t))
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
function drillSortKey(secondary: string): number {
  const m = String(secondary).match(/(\d{2})\/(\d{2})\/(\d{2})/)
  if (!m) return 0
  const [, dd, mm, yy] = m
  return Number(`20${yy}${mm}${dd}`)
}

/* ── Date helpers (local) ──────────────────────────────────────── */

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fmtDay(iso?: string | number | Date | null): string {
  if (!iso) return ''
  const d = iso instanceof Date ? iso : new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}
