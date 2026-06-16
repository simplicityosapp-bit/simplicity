import { useMemo, useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Calendar, RefreshCw, Check, CircleAlert, Link2Off, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useGoogleCalendar } from '../../hooks/useGoogleCalendar'
import { useCalendarEvents } from '../../hooks/useCalendarEvents'
import { useClients } from '../../hooks/useClients'
import { useProjects } from '../../hooks/useProjects'
import { useLeads } from '../../hooks/useLeads'
import { useGroups } from '../../hooks/useGroups'
import { useAddress } from '../../hooks/useAddress'
import './ConnectionsScreen.css'

const todayStr = () => new Date().toISOString().slice(0, 10)
const yearAgoStr = () => new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)

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
function fmtDuration(min) {
  if (!min || min <= 0) return ''
  if (min < 60) return `${min} ד׳`
  const h = Math.floor(min / 60); const m = min % 60
  return m ? `${h} ש׳ ${m} ד׳` : `${h} ש׳`
}

/* Sub-screen for the Google Calendar connection: connect / sync / disconnect +
   the synced-events accordion. The OAuth ?code callback is handled on the
   connections list (the redirect_uri is /connections); here we just begin the
   flow and manage an existing connection. */
export default function CalendarConnectionScreen() {
  const navigate = useNavigate()
  const { addr } = useAddress()
  const gcal = useGoogleCalendar()
  const { events, loading: eventsLoading, refetch, assignClient, assignProject, assignLead, assignGroup } = useCalendarEvents()
  const { clients } = useClients()
  const { projects } = useProjects()
  const { leads } = useLeads()
  const { groups } = useGroups()
  const [syncFrom, setSyncFrom] = useState(yearAgoStr())
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
      { prefix: 'c', label: 'לקוחות', link: 'client_id', fb: 'לקוח', items: clients },
      { prefix: 'p', label: 'פרויקטים', link: 'project_id', fb: 'פרויקט', items: projects },
      { prefix: 'l', label: 'לידים', link: 'lead_id', fb: 'ליד', items: leads },
      { prefix: 'g', label: 'קבוצות', link: 'group_id', fb: 'קבוצה', items: groups },
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
    if (unmatched.length) cats.push({ key: 'none', label: 'לא מזוהים', count: unmatched.length, items: unmatched, leaf: true })
    return cats
  }, [events, clients, projects, leads, groups])

  const onSync = async () => {
    setBusyAction('sync')
    setSyncMsg('')
    const res = await gcal.sync().catch(() => null)
    refetch()
    setBusyAction(null)
    if (res) setSyncMsg(`סונכרנו ${res.synced ?? 0} אירועים${res.removed ? `, הוסרו ${res.removed}` : ''}.`)
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
    { key: 'client', label: 'לקוח', field: 'client_id', list: clients, assign: assignClient },
    { key: 'project', label: 'פרויקט', field: 'project_id', list: projects, assign: assignProject },
    { key: 'lead', label: 'ליד', field: 'lead_id', list: leads, assign: assignLead },
    { key: 'group', label: 'קבוצה', field: 'group_id', list: groups, assign: assignGroup },
  ]

  const renderEvent = (ev) => {
    const links = ASSIGN_TYPES
      .filter((t) => ev[t.field])
      .map((t) => ({ ...t, name: (t.list || []).find((x) => x.id === ev[t.field])?.name || t.label }))
    const open = picker?.id === ev.id
    const active = open && picker.type ? ASSIGN_TYPES.find((t) => t.key === picker.type) : null
    return (
      <div key={ev.id} className="conn-event">
        <div className="conn-event-main">
          <p className="conn-event-title">{ev.title}</p>
          <p className="conn-event-meta">
            {fmtDateTime(ev.start_time, ev.all_day)}{!ev.all_day && ev.end_time ? `–${fmtClock(ev.end_time)}` : ''}{ev.duration_minutes ? ` · ${fmtDuration(ev.duration_minutes)}` : ''}
          </p>
          <div className="conn-assign-row">
            {links.map((t) => (
              <span key={t.key} className="conn-link-chip">
                <span className="conn-link-chip-type">{t.label}</span>
                {t.name}
                <button type="button" className="conn-link-chip-x" onClick={() => t.assign(ev, '')} aria-label={`הסרת שיוך ${t.label}`} title="הסרה">
                  <X size={11} strokeWidth={2} aria-hidden="true" />
                </button>
              </span>
            ))}
            {!open ? (
              <button type="button" className="conn-assign-add" onClick={() => setPicker({ id: ev.id, type: null })}>+ שייך ל…</button>
            ) : (
              <div className="conn-assign-picker">
                <div className="conn-assign-types">
                  {ASSIGN_TYPES.map((t) => (
                    <button key={t.key} type="button" className={`conn-type-pill${picker.type === t.key ? ' on' : ''}`} onClick={() => setPicker({ id: ev.id, type: t.key })}>{t.label}</button>
                  ))}
                </div>
                {active && (
                  <select className="conn-event-select" value={ev[active.field] || ''} onChange={(e) => { active.assign(ev, e.target.value); setPicker(null) }} aria-label={`שיוך ${active.label}`}>
                    <option value="">{addr({ male: '— בחר —', female: '— בחרי —', neutral: '— בחר/י —' })}</option>
                    {(active.list || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                )}
                <button type="button" className="conn-assign-cancel" onClick={() => setPicker(null)}>סגור</button>
              </div>
            )}
          </div>
        </div>
        <span className={`conn-tag${links.length ? ' on' : ''}`}>{links.length ? 'מזוהה' : 'לא מזוהה'}</span>
      </div>
    )
  }

  return (
    <div className="screen">
      <header className="screen-head conn-head conn-detail-head">
        <button type="button" className="conn-back" onClick={() => navigate(-1)} aria-label="חזרה">
          <ChevronRight size={20} strokeWidth={1.6} aria-hidden="true" />
        </button>
        <div>
          <p className="t-screen"><Calendar size={20} strokeWidth={1.6} aria-hidden="true" /> Google Calendar</p>
          <p className="lbl-sm">משיכת אירועים מהיומן וזיהוי פגישות עם לקוחות.</p>
        </div>
      </header>

      <section className="conn-card">
        <div className="conn-card-head">
          <span className="conn-icon"><Calendar size={22} strokeWidth={1.6} aria-hidden="true" /></span>
          <div className="conn-card-titles">
            <p className="conn-card-title">Google Calendar</p>
            <p className="conn-card-sub">
              {gcal.loading ? 'טוען…'
                : connected
                  ? <><Check size={13} strokeWidth={2} aria-hidden="true" /> מחובר{status?.last_synced_at ? ` · סונכרן ${fmtDateTime(status.last_synced_at)}` : ''}</>
                  : 'לא מחובר — משיכת אירועים מהיומן וזיהוי פגישות עם לקוחות.'}
            </p>
          </div>
        </div>

        {gcal.error && (
          <p className="conn-error" role="alert"><CircleAlert size={14} strokeWidth={1.7} aria-hidden="true" /> {gcal.error}</p>
        )}

        {!connected ? (
          <div className="conn-connect">
            <label className="conn-field">
              <span className="conn-field-lbl">מאיזה תאריך לסנכרן?</span>
              <input
                type="date"
                className="conn-date"
                value={syncFrom}
                min={yearAgoStr()}
                max={todayStr()}
                onChange={(e) => setSyncFrom(e.target.value)}
              />
            </label>
            <button type="button" className="conn-btn primary" disabled={gcal.busy} onClick={() => gcal.beginConnect(syncFrom)}>
              {gcal.busy ? 'פותח…' : 'חבר את Google Calendar'}
            </button>
          </div>
        ) : (
          <div className="conn-actions">
            <button type="button" className="conn-btn primary" disabled={gcal.busy} onClick={onSync}>
              <RefreshCw size={15} strokeWidth={1.8} aria-hidden="true" /> {busyAction === 'sync' ? 'מסנכרן…' : 'סנכרן עכשיו'}
            </button>
            <button type="button" className="conn-btn ghost danger" disabled={gcal.busy} onClick={onDisconnect}>
              <Link2Off size={15} strokeWidth={1.8} aria-hidden="true" /> {busyAction === 'disconnect' ? 'מנתק…' : (confirmDisc ? addr({ male: 'בטוח? נתק', female: 'בטוחה? נתק', neutral: 'בטוח/ה? נתק' }) : 'נתק')}
            </button>
          </div>
        )}
        {syncMsg && !gcal.error && <p className="conn-note" role="status" aria-live="polite">{syncMsg}</p>}
      </section>

      {connected && (
        <section className="conn-events">
          <button type="button" className="conn-acc-head conn-acc-main" onClick={() => setEventsOpen((v) => !v)} aria-expanded={eventsOpen}>
            <span>אירועים שסונכרנו {events.length ? `(${events.length})` : ''}</span>
            {eventsOpen ? <ChevronUp size={16} strokeWidth={1.7} aria-hidden="true" /> : <ChevronDown size={16} strokeWidth={1.7} aria-hidden="true" />}
          </button>

          {eventsOpen && (
            eventsLoading ? (
              <p className="conn-empty">טוען אירועים…</p>
            ) : events.length === 0 ? (
              <p className="conn-empty">אין אירועים בטווח שנבחר. {addr({ male: 'נסה', female: 'נסי', neutral: 'נסה/י' })} לסנכרן שוב, או לחבר מחדש עם טווח תאריכים מוקדם יותר.</p>
            ) : (
              <div className="conn-cats">
                {eventCategories.map((cat) => {
                  const catOpen = openCats.has(cat.key)
                  return (
                    <div key={cat.key} className={`conn-cat${cat.key === 'none' ? ' unmatched' : ''}`}>
                      <button type="button" className="conn-acc-head conn-acc-cat" onClick={() => toggleCat(cat.key)} aria-expanded={catOpen}>
                        <span className="conn-group-label">{cat.label}<span className="conn-group-count">{cat.count}</span></span>
                        {catOpen ? <ChevronUp size={16} strokeWidth={1.7} aria-hidden="true" /> : <ChevronDown size={16} strokeWidth={1.7} aria-hidden="true" />}
                      </button>
                      {catOpen && (
                        cat.leaf
                          ? <div className="conn-group-events">{cat.items.map(renderEvent)}</div>
                          : (
                            <div className="conn-cat-entities">
                              {cat.entities.map((ent) => {
                                const entOpen = openGroups.has(ent.key)
                                return (
                                  <div key={ent.key} className="conn-entity">
                                    <button type="button" className="conn-acc-head conn-acc-sub" onClick={() => toggleGroup(ent.key)} aria-expanded={entOpen}>
                                      <span className="conn-group-label">{ent.label}<span className="conn-group-count">{ent.items.length}</span></span>
                                      {entOpen ? <ChevronUp size={15} strokeWidth={1.7} aria-hidden="true" /> : <ChevronDown size={15} strokeWidth={1.7} aria-hidden="true" />}
                                    </button>
                                    {entOpen && <div className="conn-group-events">{ent.items.map(renderEvent)}</div>}
                                  </div>
                                )
                              })}
                            </div>
                          )
                      )}
                    </div>
                  )
                })}
              </div>
            )
          )}
        </section>
      )}
    </div>
  )
}
