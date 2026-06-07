import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Plug, Calendar, RefreshCw, Check, CircleAlert, Link2Off, ChevronDown, ChevronUp } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { useGoogleCalendar } from '../../hooks/useGoogleCalendar'
import { useCalendarEvents } from '../../hooks/useCalendarEvents'
import { useClients } from '../../hooks/useClients'
import { useProjects } from '../../hooks/useProjects'
import { useLeads } from '../../hooks/useLeads'
import { useGroups } from '../../hooks/useGroups'
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

export default function ConnectionsScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const gcal = useGoogleCalendar()
  const { events, loading: eventsLoading, refetch, assignClient, assignProject, assignLead, assignGroup } = useCalendarEvents()
  const { clients } = useClients()
  const { projects } = useProjects()
  const { leads } = useLeads()
  const { groups } = useGroups()
  const [syncFrom, setSyncFrom] = useState(yearAgoStr())
  const [callbackError, setCallbackError] = useState('')
  const handledCode = useRef(false)
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

  /* Three-level accordion: category (לקוחות/פרויקטים/לידים/קבוצות) → entity
     (one toggle per client/project/…) → events. An event matched to several
     entities appears under each. Unmatched events form a leaf "לא מזוהים"
     category (no entity level), pinned last. */
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
  const [syncMsg, setSyncMsg] = useState('')
  const discTimer = useRef(0)
  const connecting = gcal.busy && !!params.get('code')

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
      /* Two-step confirm (no undo). Auto-disarm after a few seconds —
         replaces a flaky onBlur that fired on any incidental focus shift. */
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

  /* One synced-event card — reused inside each accordion group. */
  const renderEvent = (ev) => {
    const matched = !!(ev.client_id || ev.project_id || ev.lead_id || ev.group_id)
    return (
      <div key={ev.id} className="conn-event">
        <div className="conn-event-main">
          <p className="conn-event-title">{ev.title}</p>
          <p className="conn-event-meta">
            {fmtDateTime(ev.start_time, ev.all_day)}{!ev.all_day && ev.end_time ? `–${fmtClock(ev.end_time)}` : ''}{ev.duration_minutes ? ` · ${fmtDuration(ev.duration_minutes)}` : ''}
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
            <label className="conn-assign">
              <span className="conn-assign-lbl">ליד</span>
              <select className="conn-event-select" value={ev.lead_id || ''} onChange={(e) => assignLead(ev, e.target.value)} aria-label="שיוך ליד">
                <option value="">— ללא —</option>
                {(leads || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label className="conn-assign">
              <span className="conn-assign-lbl">קבוצה</span>
              <select className="conn-event-select" value={ev.group_id || ''} onChange={(e) => assignGroup(ev, e.target.value)} aria-label="שיוך קבוצה">
                <option value="">— ללא —</option>
                {(groups || []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
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
            <button type="button" className="conn-btn ghost danger" disabled={gcal.busy} onClick={onDisconnect}>
              <Link2Off size={15} strokeWidth={1.8} aria-hidden="true" /> {busyAction === 'disconnect' ? 'מנתק…' : (confirmDisc ? 'בטוח? נתק' : 'נתק')}
            </button>
          </div>
        )}
        {syncMsg && !gcal.error && <p className="conn-note">{syncMsg}</p>}
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
              <p className="conn-empty">אין אירועים בטווח שנבחר. נסה/י לסנכרן שוב, או לחבר מחדש עם טווח תאריכים מוקדם יותר.</p>
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
