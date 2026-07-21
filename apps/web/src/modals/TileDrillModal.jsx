import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'
import { ROUTES } from '../lib/routes'
import { isr, fmtTime } from '@simplicity/core'
import { getTileFilters, todayItems } from '../lib/homeData'
import { confirmScheduledMeeting, billPerSessionMeeting } from '../lib/scheduledMeetings'
import WhatsAppButton from '../components/WhatsAppButton'
import { useT } from '../i18n/useT'
import { ClientsTrend, NetBars } from './TileDrillCharts'
import { Box, Txt, Btn } from '../components/ui'

/* Option keys only — labels are resolved via t() at render so the pills
   localize. The `tk` is the sub-key under the given group in the json. */
const STATUS_OPTIONS = ['active', 'wandering', 'past', 'no_status']
const NET_RANGES = ['thisWeek', 'thisMonth', 'last30days']
const NET_TYPES = ['both', 'income', 'expense']
const TODAY_KINDS = ['meeting', 'calendar', 'followup', 'reminder']

function toggleInList(list, value) {
  const arr = list || []
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value]
}

/* Pills group — single-select by default, multi via `multi` prop. Mobile-
   friendly: rows wrap, no horizontal overflow drama. `options` is a list of
   keys; `label(key)` resolves each to localized text. */
function Pills({ options, value, onChange, multi = false, label }) {
  return (
    <Box className="td-pills">
      {options.map((k) => {
        const active = multi ? (value || []).includes(k) : value === k
        return (
          <Btn
            key={k}
            type="button"
            className={`td-pill${active ? ' on' : ''}`}
            onClick={() => onChange(multi ? toggleInList(value, k) : k)}
          >
            {label(k)}
          </Btn>
        )
      })}
    </Box>
  )
}

/* Multi-select pill list with a leading "all" reset (active when nothing
   is selected). Replaces the old single-pick <select> for project/group/
   client/category filters — matches the prototype's multi-axis filter UX. */
function MultiPills({ items, selected, onChange, allLabel, emptyLabel }) {
  if (!items?.length) {
    return <Txt as="p" className="td-empty-inline">{emptyLabel}</Txt>
  }
  const list = selected || []
  return (
    <Box className="td-pills td-pills-multi">
      <Btn
        type="button"
        className={`td-pill${list.length === 0 ? ' on' : ''}`}
        onClick={() => onChange([])}
      >
        {allLabel}
      </Btn>
      {items.map((it) => {
        const active = list.includes(it.id)
        return (
          <Btn
            key={it.id}
            type="button"
            className={`td-pill${active ? ' on' : ''}`}
            onClick={() => onChange(toggleInList(list, it.id))}
            title={it.name}
          >
            {it.color && <Txt className="td-pill-dot" style={{ background: it.color }} />}
            <Txt className="td-pill-name">{it.name}</Txt>
          </Btn>
        )
      })}
    </Box>
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
      <Txt as="p" className="td-num mono">{filtered.length}</Txt>
      <Txt as="p" className="td-num-lbl">{t('tileDrill.clients.matchingNum')}</Txt>

      <Box className="td-chart-block">
        <Txt as="p" className="td-chart-lbl">{t('tileDrill.clients.trendLbl')}</Txt>
        <ClientsTrend values={trend} />
      </Box>

      <Txt as="p" className="td-field-lbl">{t('tileDrill.clients.statusLbl')}</Txt>
      <Pills options={STATUS_OPTIONS} value={filters.statuses} multi
             label={(k) => t(`tileDrill.status.${k}`)}
             onChange={(v) => setFilter('statuses', v)} />

      <Txt as="p" className="td-field-lbl">{t('tileDrill.clients.projectLbl')}</Txt>
      <MultiPills items={projects} selected={filters.projectIds} onChange={(v) => setFilter('projectIds', v)} allLabel={t('tileDrill.all')} emptyLabel={t('tileDrill.clients.noProjects')} />

      <Txt as="p" className="td-field-lbl">{t('tileDrill.clients.groupLbl')}</Txt>
      <MultiPills items={groups} selected={filters.groupIds} onChange={(v) => setFilter('groupIds', v)} allLabel={t('tileDrill.all')} emptyLabel={t('tileDrill.clients.noGroups')} />

      <Txt as="p" className="td-section-lbl">{t('tileDrill.clients.matchingSection', { count: filtered.length })}</Txt>
      <Box className="td-list">
        {filtered.length === 0 ? (
          <Txt as="p" className="td-empty">{t('tileDrill.clients.emptyFilter')}</Txt>
        ) : (
          filtered.slice(0, 8).map((c) => (
            <Box key={c.id} className="td-list-row">
              <Txt className="td-list-name">{c.name}</Txt>
              <Txt className="td-list-meta">{statusLabel(c.status_meta || c.status, t)}</Txt>
            </Box>
          ))
        )}
        {filtered.length > 8 && (
          <Txt as="p" className="td-list-more">{t('tileDrill.clients.moreCount', { count: filtered.length - 8 })}</Txt>
        )}
      </Box>
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
      <Txt as="p" className={`td-num mono${summary.net < 0 ? ' neg' : ''}`}>
        {summary.net < 0 ? '−' : ''}{isr(Math.abs(summary.net))}
      </Txt>
      <Txt as="p" className="td-num-lbl">{filters.type === 'income' ? t('tileDrill.net.income') : filters.type === 'expense' ? t('tileDrill.net.expense') : t('tileDrill.net.net')}</Txt>

      <Box className="td-chart-block">
        <Txt as="p" className="td-chart-lbl">{t('tileDrill.net.trendLbl')}</Txt>
        <NetBars incomes={trend.incomes} expenses={trend.expenses} />
        <Box className="td-chart-legend">
          <Txt className="td-chart-key"><Txt className="td-chart-swatch sage" />{t('tileDrill.net.legendIncome')}</Txt>
          <Txt className="td-chart-key"><Txt className="td-chart-swatch clay" />{t('tileDrill.net.legendExpense')}</Txt>
        </Box>
      </Box>

      <Txt as="p" className="td-field-lbl">{t('tileDrill.net.timeRangeLbl')}</Txt>
      <Pills options={NET_RANGES} value={filters.timeRange}
             label={(k) => t(`tileDrill.netRanges.${k}`)}
             onChange={(v) => setFilter('timeRange', v)} />

      <Txt as="p" className="td-field-lbl">{t('tileDrill.net.typeLbl')}</Txt>
      <Pills options={NET_TYPES} value={filters.type}
             label={(k) => t(`tileDrill.netTypes.${k}`)}
             onChange={(v) => setFilter('type', v)} />

      <Txt as="p" className="td-field-lbl">{t('tileDrill.net.projectLbl')}</Txt>
      <MultiPills items={projects} selected={filters.projectIds} onChange={(v) => setFilter('projectIds', v)} allLabel={t('tileDrill.all')} emptyLabel={t('tileDrill.net.noProjects')} />

      <Txt as="p" className="td-field-lbl">{t('tileDrill.net.categoryLbl')}</Txt>
      <MultiPills items={categories} selected={filters.categoryIds} onChange={(v) => setFilter('categoryIds', v)} allLabel={t('tileDrill.all')} emptyLabel={t('tileDrill.net.noCategories')} />

      <Box className="td-mini-stats">
        <Box className="td-mini">
          <Txt as="p" className="td-mini-l">{t('tileDrill.net.miniIncome')}</Txt>
          <Txt as="p" className="td-mini-v mono">{isr(summary._income || 0)}</Txt>
        </Box>
        <Box className="td-mini">
          <Txt as="p" className="td-mini-l">{t('tileDrill.net.miniExpense')}</Txt>
          <Txt as="p" className="td-mini-v mono">{isr(summary._expense || 0)}</Txt>
        </Box>
        <Box className="td-mini">
          <Txt as="p" className="td-mini-l">{t('tileDrill.net.miniTx')}</Txt>
          <Txt as="p" className="td-mini-v mono">{summary._txCount || 0}</Txt>
        </Box>
      </Box>
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
      <Txt as="p" className="td-num mono">{items.length}</Txt>
      <Txt as="p" className="td-num-lbl">{t('tileDrill.today.matchingNum')}</Txt>

      <Txt as="p" className="td-field-lbl">{t('tileDrill.today.kindsLbl')}</Txt>
      <Pills options={TODAY_KINDS} value={kinds} multi
             label={(k) => t(`tileDrill.todayKinds.${k}`)}
             onChange={(v) => setFilter('kinds', v.length ? v : TODAY_KINDS)} />

      <Txt as="p" className="td-section-lbl">{t('tileDrill.today.listSection')}</Txt>
      <Box className="td-list">
        {items.length === 0 ? (
          <Txt as="p" className="td-empty">{t('tileDrill.today.empty')}</Txt>
        ) : (
          items.map((it) => (
            <Box key={it.id} className={`td-today-row kind-${it.kind}${it.kind === 'meeting' && it.status === 'confirmed' ? ' is-done' : ''}`}>
              <Btn
                type="button"
                className="td-today-main"
                onClick={() => onOpen(it)}
                disabled={it.kind === 'calendar' || it.kind === 'reminder'}
              >
                <Txt className="td-today-time mono">{it.allDay ? t('tileDrill.today.allDay') : fmtTime(it.when)}</Txt>
                <Txt className="td-today-name">{it.title || t(`tileDrill.todayKinds.${it.kind}`)}</Txt>
                <Txt className={`td-today-kind kind-${it.kind}`}>{t(`tileDrill.todayKinds.${it.kind}`)}</Txt>
              </Btn>
              <Box className="td-today-acts">
                {it.phone && (
                  <WhatsAppButton
                    phone={it.phone}
                    message={waMsg(it.kind === 'followup' ? 'lead' : 'client', { name: it.title })}
                    triggerClassName="td-today-act"
                  />
                )}
                {it.kind === 'meeting' && (
                  it.status === 'confirmed' ? (
                    <Txt className="td-today-done" title={t('tileDrill.today.happened')}>
                      <Check size={14} strokeWidth={2.4} aria-hidden="true" />
                      {t('tileDrill.today.happened')}
                    </Txt>
                  ) : (
                    <Btn
                      type="button"
                      className="td-today-act confirm"
                      onClick={() => onConfirm(it)}
                      aria-label={t('tileDrill.today.markHappened')}
                      title={t('tileDrill.today.markHappened')}
                    >
                      <Check size={15} strokeWidth={2} aria-hidden="true" />
                    </Btn>
                  )
                )}
              </Box>
            </Box>
          ))
        )}
      </Box>
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
  transactions = [],
  netSummary = {},
  meetings = [], calendarEvents = [], leads = [], reminders = [], sessions = [], addSession, updateMeeting, waMsg,
}) {
  const { t } = useT('modalsSystem')
  const { t: tb } = useT('modalsTask') // reuse the calendar's one-off charge strings
  const [billPrompt, setBillPrompt] = useState(null) // per-session client to charge after confirming
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
    () => (tile === 'today' ? todayItems(new Date(), { meetings, calendarEvents, leads, clients, groups, reminders }, { kinds: todayKinds }) : []),
    [tile, meetings, calendarEvents, leads, clients, groups, reminders, todayKinds],
  )
  /* "Happened" materializes a session + flips the meeting to confirmed — the
     shared helper used by the home review widget and the calendar. Per-session
     clients don't auto-materialise (that would double-count vs. their
     per-meeting charge); after confirming, offer the one-off charge. */
  const confirmToday = async (it) => {
    if (it.meeting && addSession && updateMeeting) {
      const c = it.meeting.subject_type === 'client' ? (clients || []).find((x) => x.id === it.meeting.subject_id) : null
      await confirmScheduledMeeting({ meeting: it.meeting, sessions, addSession, updateMeeting, clients })
      if (c?.billing_mode === 'per_session') setBillPrompt({ meeting: it.meeting, client: c })
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
    today: ROUTES.CALENDAR,
  }

  return (
    <>
    <Modal open={open} onClose={onClose} title={tile ? t(`tileDrill.titles.${tile}`) : ''}>
      <Box className="td-body">
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
      </Box>

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={onClose}>{t('tileDrill.close')}</Btn>
        <Btn
          type="button"
          className="m-btn-save"
          onClick={() => { navigate(routes[tile]); onClose() }}
        >
          <ArrowLeft size={14} strokeWidth={1.8} aria-hidden="true" /> {t('tileDrill.openFull')}
        </Btn>
      </Box>
    </Modal>
    {/* One-off charge prompt for a per-session client, after confirming a meeting. */}
    <ConfirmModal
      open={!!billPrompt}
      onClose={() => setBillPrompt(null)}
      message={billPrompt && (Number(billPrompt.client.price_per_session) > 0
        ? tb('event.billOneOff', { name: billPrompt.client.name, amount: isr(billPrompt.client.price_per_session) })
        : tb('event.billOneOffNoPrice', { name: billPrompt.client.name }))}
      confirmLabel={tb('event.billYes')}
      cancelLabel={tb('event.billNo')}
      onConfirm={() => billPerSessionMeeting({ meeting: billPrompt.meeting, sessions, addSession })}
    />
    </>
  )
}
