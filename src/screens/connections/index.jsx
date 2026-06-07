import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Plug, Calendar, RefreshCw, Check, CircleAlert, Link2Off, ChevronDown, ChevronUp } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { useGoogleCalendar } from '../../hooks/useGoogleCalendar'
import { useCalendarEvents } from '../../hooks/useCalendarEvents'
import { useClients } from '../../hooks/useClients'
import { useProjects } from '../../hooks/useProjects'
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
function fmtDuration(min) {
  if (!min || min <= 0) return ''
  if (min < 60) return `${min} ד׳`
  const h = Math.floor(min / 60); const m = min % 60
  return m ? `${h} ש׳ ${m} ד׳` : `${h} ש׳`
}

export default function ConnectionsScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const gcal = useGoogleCalendar()
  const { events, loading: eventsLoading, refetch, assignClient, assignProject } = useCalendarEvents()
  const { clients } = useClients()
  const { projects } = useProjects()
  const [syncFrom, setSyncFrom] = useState(yearAgoStr())
  const [callbackError, setCallbackError] = useState('')
  const handledCode = useRef(false)
  const [eventsOpen, setEventsOpen] = useState(true)
  const [openGroups, setOpenGroups] = useState(() => new Set())
  const toggleGroup = (key) => setOpenGroups((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  /* Group synced events by their identified entity (client first, else
     project); unidentified pinned last — drives the nested accordion. */
  const eventGroups = useMemo(() => {
    const clientName = new Map((clients || []).map((c) => [c.id, c.name]))
    const projectName = new Map((projects || []).map((p) => [p.id, p.name]))
    const map = new Map()
    ;(events || []).forEach((ev) => {
      let key, label
      if (ev.client_id) { key = `c:${ev.client_id}`; label = clientName.get(ev.client_id) || 'לקוח' }
      else if (ev.project_id) { key = `p:${ev.project_id}`; label = projectName.get(ev.project_id) || 'פרויקט' }
      else { key = 'none'; label = 'לא מזוהים' }
      if (!map.has(key)) map.set(key, { key, label, items: [] })
      map.get(key).items.push(ev)
    })
    const groups = [...map.values()]
    groups.sort((a, b) => {
      if (a.key === 'none') return 1
      if (b.key === 'none') return -1
      return a.label.localeCompare(b.label, 'he')
    })
    return groups
  }, [events, clients, projects])

  /* OAuth return: Google sent us back with ?code (or ?error). Exchange it
     once, then scrub the query string so a refresh can't re-fire it. */
  useEffect(() => {
    if (handledCode.current) return
    const code = params.get('code')
    const err = params.get('error')
    if (!code && !err) return
    handledCode.current = true
    const finish = () => navigate(ROUTES.CONNECTIONS, { replace: true })
    if (err) {
      Promise.resolve().then(() => setCallbackError('החיבור בוטל או נדחה.')).finally(finish)
    } else {
      gcal.completeConnect(code)
        .then(() => refetch())
        .catch(() => setCallbackError('החיבור נכשל. נסו שוב.'))
        .finally(finish)
    }
  }, [params, gcal, navigate, refetch])

  const status = gcal.status
  const connected = !!status?.connected
  const [busyAction, setBusyAction] = useState(null) // 'sync' | 'disconnect'
  const [confirmDisc, setConfirmDisc] = useState(false)
  const connecting = gcal.busy && !!params.get('code')

  const onSync = async () => {
    setBusyAction('sync')
    await gcal.sync().catch(() => {})
    refetch()
    setBusyAction(null)
  }
  const onDisconnect = async () => {
    if (!confirmDisc) { setConfirmDisc(true); return } // two-step confirm — no undo
    setConfirmDisc(false)
    setBusyAction('disconnect')
    await gcal.disconnect()
    refetch()
    setBusyAction(null)
  }

  /* One synced-event card — reused inside each accordion group. */
  const renderEvent = (ev) => {
    const matched = !!(ev.client_id || ev.project_id)
    return (
      <div key={ev.id} className="conn-event">
        <div className="conn-event-main">
          <p className="conn-event-title">{ev.title}</p>
          <p className="conn-event-meta">
            {fmtDateTime(ev.start_time, ev.all_day)}{ev.duration_minutes ? ` · ${fmtDuration(ev.duration_minutes)}` : ''}
          </p>
          <div className="conn-assign-row">
            <label className="conn-assign">
              <span className="conn-assign-lbl">לקוח</span>
              <select className="conn-event-select" value={ev.client_id || ''} onChange={(e) => assignClient(ev, e.target.value)} aria-label="שיוך לקוח">
                <option value="">— ללא —</option>
                {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="conn-assign">
              <span className="conn-assign-lbl">פרויקט</span>
              <select className="conn-event-select" value={ev.project_id || ''} onChange={(e) => assignProject(ev, e.target.value)} aria-label="שיוך פרויקט">
                <option value="">— ללא —</option>
                {(projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </div>
        </div>
        <span className={`conn-tag${matched ? ' on' : ''}`}>{matched ? 'מזוהה' : 'לא מזוהה'}</span>
      </div>
    )
  }

  return (
    <div className="screen">
      <header className="screen-head conn-head">
        <div>
          <p className="t-screen"><Plug size={20} strokeWidth={1.6} aria-hidden="true" /> חיבורים</p>
          <p className="lbl-sm">חברו שירותים חיצוניים כדי למשוך נתונים אוטומטית.</p>
        </div>
      </header>

      {/* ── Google Calendar card ──────────────────────────────── */}
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

        {connecting && <p className="conn-note">מתחבר ומסנכרן…</p>}
        {(gcal.error || callbackError) && (
          <p className="conn-error"><CircleAlert size={14} strokeWidth={1.7} aria-hidden="true" /> {callbackError || gcal.error}</p>
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
            <button type="button" className="conn-btn primary" disabled={gcal.busy} onClick={() => { setCallbackError(''); gcal.beginConnect(syncFrom) }}>
              {gcal.busy ? 'פותח…' : 'חבר את Google Calendar'}
            </button>
          </div>
        ) : (
          <div className="conn-actions">
            <button type="button" className="conn-btn primary" disabled={gcal.busy} onClick={onSync}>
              <RefreshCw size={15} strokeWidth={1.8} aria-hidden="true" /> {busyAction === 'sync' ? 'מסנכרן…' : 'סנכרן עכשיו'}
            </button>
            <button type="button" className="conn-btn ghost danger" disabled={gcal.busy} onClick={onDisconnect} onBlur={() => setConfirmDisc(false)}>
              <Link2Off size={15} strokeWidth={1.8} aria-hidden="true" /> {busyAction === 'disconnect' ? 'מנתק…' : (confirmDisc ? 'בטוח? נתק' : 'נתק')}
            </button>
          </div>
        )}
      </section>

      {/* ── Synced events — nested accordion ──────────────────── */}
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
              <p className="conn-empty">אין אירועים בטווח שנבחר. נסה/י לסנכרן שוב או להרחיב את הטווח.</p>
            ) : (
              <div className="conn-groups">
                {eventGroups.map((g) => {
                  const open = openGroups.has(g.key)
                  return (
                    <div key={g.key} className={`conn-group${g.key === 'none' ? ' unmatched' : ''}`}>
                      <button type="button" className="conn-acc-head conn-acc-sub" onClick={() => toggleGroup(g.key)} aria-expanded={open}>
                        <span className="conn-group-label">{g.label}<span className="conn-group-count">{g.items.length}</span></span>
                        {open ? <ChevronUp size={15} strokeWidth={1.7} aria-hidden="true" /> : <ChevronDown size={15} strokeWidth={1.7} aria-hidden="true" />}
                      </button>
                      {open && <div className="conn-group-events">{g.items.map(renderEvent)}</div>}
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
