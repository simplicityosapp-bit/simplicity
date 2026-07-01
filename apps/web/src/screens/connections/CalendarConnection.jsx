import { useMemo, useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Calendar, RefreshCw, Check, CircleAlert, Link2Off, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useGoogleCalendar } from '../../hooks/useGoogleCalendar'
import { useCalendarEvents } from '../../hooks/useCalendarEvents'
import { useClients } from '../../hooks/useClients'
import { useProjects } from '../../hooks/useProjects'
import { useLeads } from '../../hooks/useLeads'
import { useGroups } from '../../hooks/useGroups'
import { useT } from '../../i18n/useT'
import './ConnectionsScreen.css'
import { Box, Txt, Btn, Input } from '../../components/ui'

const todayStr = () => new Date().toISOString().slice(0, 10)
const yearAgoStr = () => new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)
/* Default look-back for the initial sync: one month. A year of history is
   still selectable manually (the input's `min` stays a year ago) — most
   users only need the recent weeks, so a month keeps the first sync light. */
const monthAgoStr = () => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

function fmtDateTime(iso, allDay) {
  if (!iso) return ''
  const d = new Date(iso)
  const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
  if (allDay) return date
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  return `${date} · ${time}`
}
function fmtClock(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}
function fmtDuration(min, t) {
  if (!min || min <= 0) return ''
  if (min < 60) return t('calendar.minutes', { count: min })
  const h = Math.floor(min / 60); const m = min % 60
  return m ? t('calendar.hoursMinutes', { h, m }) : t('calendar.hours', { count: h })
}

/* Sub-screen for the Google Calendar connection: connect / sync / disconnect +
   the synced-events accordion. The OAuth ?code callback is handled on the
   connections list (the redirect_uri is /connections); here we just begin the
   flow and manage an existing connection. */
export default function CalendarConnectionScreen() {
  const { t } = useT('connections')
  const navigate = useNavigate()
  const gcal = useGoogleCalendar()
  const { events, loading: eventsLoading, refetch, assignClient, assignProject, assignLead, assignGroup } = useCalendarEvents()
  const { clients } = useClients()
  const { projects } = useProjects()
  const { leads } = useLeads()
  const { groups } = useGroups()
  const [syncFrom, setSyncFrom] = useState(monthAgoStr())
  const [eventsOpen, setEventsOpen] = useState(true)
  const [openCats, setOpenCats] = useState(() => new Set())
  const [openGroups, setOpenGroups] = useState(() => new Set())
  const toggleSet = (setter) => (key) => setter((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const toggleCat = toggleSet(setOpenCats)
  const toggleGroup = toggleSet(setOpenGroups)

  const status = gcal.status
  const connected = !!status?.connected
  const [busyAction, setBusyAction] = useState(null) // 'sync' | 'disconnect'
  const [confirmDisc, setConfirmDisc] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const discTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(discTimer.current), [])

  /* Three-level accordion: category (לקוחות/פרויקטים/לידים/קבוצות) → entity
     (one toggle per client/project/…) → events. */
  const eventCategories = useMemo(() => {
    const defs = [
      { prefix: 'c', label: t('calendar.cats.clients'), link: 'client_id', fb: t('calendar.fb.client'), items: clients },
      { prefix: 'p', label: t('calendar.cats.projects'), link: 'project_id', fb: t('calendar.fb.project'), items: projects },
      { prefix: 'l', label: t('calendar.cats.leads'), link: 'lead_id', fb: t('calendar.fb.lead'), items: leads },
      { prefix: 'g', label: t('calendar.cats.groups'), link: 'group_id', fb: t('calendar.fb.group'), items: groups },
    ]
    const cats = []
    for (const d of defs) {
      const nameMap = new Map((d.items || []).map((x) => [x.id, x.name]))
      const entMap = new Map()
      ;(events || []).forEach((ev) => {
        const id = ev[d.link]
        if (!id) return
        const key = `${d.prefix}:${id}`
        if (!entMap.has(key)) entMap.set(key, { key, label: nameMap.get(id) || d.fb, items: [] })
        entMap.get(key).items.push(ev)
      })
      if (entMap.size === 0) continue
      const entities = [...entMap.values()].sort((a, b) => a.label.localeCompare(b.label, 'he'))
      const count = entities.reduce((n, e) => n + e.items.length, 0)
      cats.push({ key: d.prefix, label: d.label, count, entities })
    }
    const unmatched = (events || []).filter((ev) => !ev.client_id && !ev.project_id && !ev.lead_id && !ev.group_id)
    if (unmatched.length) cats.push({ key: 'none', label: t('calendar.cats.unmatched'), count: unmatched.length, items: unmatched, leaf: true })
    return cats
  }, [events, clients, projects, leads, groups, t])

  const onSync = async () => {
    setBusyAction('sync')
    setSyncMsg('')
    const res = await gcal.sync().catch(() => null)
    refetch()
    setBusyAction(null)
    if (res) setSyncMsg(t('calendar.syncResult', {
      synced: res.synced ?? 0,
      removed: res.removed ? t('calendar.syncRemoved', { count: res.removed }) : '',
    }))
  }
  const onDisconnect = async () => {
    if (!confirmDisc) {
      setConfirmDisc(true)
      window.clearTimeout(discTimer.current)
      discTimer.current = window.setTimeout(() => setConfirmDisc(false), 4000)
      return
    }
    window.clearTimeout(discTimer.current)
    setConfirmDisc(false)
    setBusyAction('disconnect')
    await gcal.disconnect()
    refetch()
    setBusyAction(null)
  }

  const [picker, setPicker] = useState(null) // { id, type } — which event's "שייך ל…" picker is open
  const ASSIGN_TYPES = [
    { key: 'client', label: t('calendar.assignTypes.client'), field: 'client_id', list: clients, assign: assignClient },
    { key: 'project', label: t('calendar.assignTypes.project'), field: 'project_id', list: projects, assign: assignProject },
    { key: 'lead', label: t('calendar.assignTypes.lead'), field: 'lead_id', list: leads, assign: assignLead },
    { key: 'group', label: t('calendar.assignTypes.group'), field: 'group_id', list: groups, assign: assignGroup },
  ]

  const renderEvent = (ev) => {
    const links = ASSIGN_TYPES
      .filter((at) => ev[at.field])
      .map((at) => ({ ...at, name: (at.list || []).find((x) => x.id === ev[at.field])?.name || at.label }))
    const open = picker?.id === ev.id
    const active = open && picker.type ? ASSIGN_TYPES.find((at) => at.key === picker.type) : null
    return (
      <Box key={ev.id} className="conn-event">
        <Box className="conn-event-main">
          <Txt as="p" className="conn-event-title">{ev.title}</Txt>
          <Txt as="p" className="conn-event-meta">
            {fmtDateTime(ev.start_time, ev.all_day)}{!ev.all_day && ev.end_time ? `–${fmtClock(ev.end_time)}` : ''}{ev.duration_minutes ? ` · ${fmtDuration(ev.duration_minutes, t)}` : ''}
          </Txt>
          <Box className="conn-assign-row">
            {links.map((at) => (
              <Txt key={at.key} className="conn-link-chip">
                <Txt className="conn-link-chip-type">{at.label}</Txt>
                {at.name}
                <Btn type="button" className="conn-link-chip-x" onClick={() => at.assign(ev, '')} aria-label={t('calendar.removeLinkAria', { type: at.label })} title={t('calendar.remove')}>
                  <X size={11} strokeWidth={2} aria-hidden="true" />
                </Btn>
              </Txt>
            ))}
            {!open ? (
              <Btn type="button" className="conn-assign-add" onClick={() => setPicker({ id: ev.id, type: null })}>{t('calendar.assignTo')}</Btn>
            ) : (
              <Box className="conn-assign-picker">
                <Box className="conn-assign-types">
                  {ASSIGN_TYPES.map((at) => (
                    <Btn key={at.key} type="button" className={`conn-type-pill${picker.type === at.key ? ' on' : ''}`} onClick={() => setPicker({ id: ev.id, type: at.key })}>{at.label}</Btn>
                  ))}
                </Box>
                {active && (
                  <select className="conn-event-select" value={ev[active.field] || ''} onChange={(e) => { active.assign(ev, e.target.value); setPicker(null) }} aria-label={t('calendar.assignAria', { type: active.label })}>
                    <option value="">{t('calendar.pick')}</option>
                    {(active.list || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                )}
                <Btn type="button" className="conn-assign-cancel" onClick={() => setPicker(null)}>{t('calendar.close')}</Btn>
              </Box>
            )}
          </Box>
        </Box>
        <Txt className={`conn-tag${links.length ? ' on' : ''}`}>{links.length ? t('calendar.identified') : t('calendar.notIdentified')}</Txt>
      </Box>
    )
  }

  return (
    <Box className="screen">
      <Box as="header" className="screen-head conn-head conn-detail-head">
        <Btn type="button" className="conn-back" onClick={() => navigate(-1)} aria-label={t('calendar.back')}>
          <ChevronRight size={20} strokeWidth={1.6} aria-hidden="true" />
        </Btn>
        <Box>
          <Txt as="p" className="t-screen"><Calendar size={20} strokeWidth={1.6} aria-hidden="true" /> Google Calendar</Txt>
          <Txt as="p" className="lbl-sm">{t('calendar.subtitle')}</Txt>
        </Box>
      </Box>

      <Box as="section" className="conn-card">
        <Box className="conn-card-head">
          <Txt className="conn-icon"><Calendar size={22} strokeWidth={1.6} aria-hidden="true" /></Txt>
          <Box className="conn-card-titles">
            <Txt as="p" className="conn-card-title">Google Calendar</Txt>
            <Txt as="p" className="conn-card-sub">
              {gcal.loading ? t('loading')
                : connected
                  ? <><Check size={13} strokeWidth={2} aria-hidden="true" /> {status?.last_synced_at ? t('calendar.connectedSynced', { date: fmtDateTime(status.last_synced_at) }) : t('calendar.connected')}</>
                  : t('calendar.notConnectedHint')}
            </Txt>
          </Box>
        </Box>

        {gcal.error && (
          <Txt as="p" className="conn-error" role="alert"><CircleAlert size={14} strokeWidth={1.7} aria-hidden="true" /> {gcal.error}</Txt>
        )}

        {!connected ? (
          <Box className="conn-connect">
            <Box as="label" className="conn-field">
              <Txt className="conn-field-lbl">{t('calendar.syncFromLabel')}</Txt>
              <Input
                type="date"
                className="conn-date"
                value={syncFrom}
                min={yearAgoStr()}
                max={todayStr()}
                onChange={(e) => setSyncFrom(e.target.value)}
              />
            </Box>
            <Btn type="button" className="conn-btn primary" disabled={gcal.busy} onClick={() => gcal.beginConnect(syncFrom)}>
              {gcal.busy ? t('calendar.opening') : t('calendar.connect')}
            </Btn>
          </Box>
        ) : (
          <Box className="conn-actions">
            <Btn type="button" className="conn-btn primary" disabled={gcal.busy} onClick={onSync}>
              <RefreshCw size={15} strokeWidth={1.8} aria-hidden="true" /> {busyAction === 'sync' ? t('calendar.syncing') : t('calendar.syncNow')}
            </Btn>
            <Btn type="button" className="conn-btn ghost danger" disabled={gcal.busy} onClick={onDisconnect}>
              <Link2Off size={15} strokeWidth={1.8} aria-hidden="true" /> {busyAction === 'disconnect' ? t('calendar.disconnecting') : (confirmDisc ? t('calendar.disconnectConfirm') : t('calendar.disconnect'))}
            </Btn>
          </Box>
        )}
        {syncMsg && !gcal.error && <Txt as="p" className="conn-note" role="status" aria-live="polite">{syncMsg}</Txt>}
      </Box>

      {connected && (
        <Box as="section" className="conn-events">
          <Btn type="button" className="conn-acc-head conn-acc-main" onClick={() => setEventsOpen((v) => !v)} aria-expanded={eventsOpen}>
            <Txt>{t('calendar.eventsTitle')} {events.length ? `(${events.length})` : ''}</Txt>
            {eventsOpen ? <ChevronUp size={16} strokeWidth={1.7} aria-hidden="true" /> : <ChevronDown size={16} strokeWidth={1.7} aria-hidden="true" />}
          </Btn>

          {eventsOpen && (
            eventsLoading ? (
              <Txt as="p" className="conn-empty">{t('calendar.loadingEvents')}</Txt>
            ) : events.length === 0 ? (
              <Txt as="p" className="conn-empty">{t('calendar.noEventsInRange', { retry: t('calendar.retry') })}</Txt>
            ) : (
              <Box className="conn-cats">
                {eventCategories.map((cat) => {
                  const catOpen = openCats.has(cat.key)
                  return (
                    <Box key={cat.key} className={`conn-cat${cat.key === 'none' ? ' unmatched' : ''}`}>
                      <Btn type="button" className="conn-acc-head conn-acc-cat" onClick={() => toggleCat(cat.key)} aria-expanded={catOpen}>
                        <Txt className="conn-group-label">{cat.label}<Txt className="conn-group-count">{cat.count}</Txt></Txt>
                        {catOpen ? <ChevronUp size={16} strokeWidth={1.7} aria-hidden="true" /> : <ChevronDown size={16} strokeWidth={1.7} aria-hidden="true" />}
                      </Btn>
                      {catOpen && (
                        cat.leaf
                          ? <Box className="conn-group-events">{cat.items.map(renderEvent)}</Box>
                          : (
                            <Box className="conn-cat-entities">
                              {cat.entities.map((ent) => {
                                const entOpen = openGroups.has(ent.key)
                                return (
                                  <Box key={ent.key} className="conn-entity">
                                    <Btn type="button" className="conn-acc-head conn-acc-sub" onClick={() => toggleGroup(ent.key)} aria-expanded={entOpen}>
                                      <Txt className="conn-group-label">{ent.label}<Txt className="conn-group-count">{ent.items.length}</Txt></Txt>
                                      {entOpen ? <ChevronUp size={15} strokeWidth={1.7} aria-hidden="true" /> : <ChevronDown size={15} strokeWidth={1.7} aria-hidden="true" />}
                                    </Btn>
                                    {entOpen && <Box className="conn-group-events">{ent.items.map(renderEvent)}</Box>}
                                  </Box>
                                )
                              })}
                            </Box>
                          )
                      )}
                    </Box>
                  )
                })}
              </Box>
            )
          )}
        </Box>
      )}
    </Box>
  )
}
